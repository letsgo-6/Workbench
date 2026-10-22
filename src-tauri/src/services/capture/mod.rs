pub mod dates;
pub mod normalize;
pub mod persistence;
pub mod prefix;

use crate::{
    domain::{
        ai::{AiInput, AiStreamEvent, ChatMessage},
        capture::CapturePreview,
        common::EntityType,
        provider::ProviderView,
        tip::PRESET_TOOLS,
    },
    error::{AppError, AppResult, ErrorCode},
    repo,
    services::ai,
};
use chrono::NaiveDateTime;

/// Owned snapshot; no database lock survives the asynchronous request.
pub struct Analysis {
    original: String,
    forced: Option<EntityType>,
    target: Option<EntityType>,
    component_prefix: bool,
    now: NaiveDateTime,
    existing_tags: Vec<String>,
    known_tools: Vec<String>,
    messages: Vec<ChatMessage>,
    truncated: bool,
}
/// Prepare the saved template and normalization context in one synchronous read.
pub fn prepare(conn: &rusqlite::Connection, text: &str, now: NaiveDateTime) -> AppResult<Analysis> {
    prepare_for(conn, text, None, now)
}
/// v0.5: an explicit composer target wins over a typed prefix and the model's own classification.
pub fn prepare_for(
    conn: &rusqlite::Connection,
    text: &str,
    target: Option<EntityType>,
    now: NaiveDateTime,
) -> AppResult<Analysis> {
    let detected = prefix::detect(text);
    let original = detected.map(|(_, body)| body).unwrap_or(text).to_string();
    if original.trim().is_empty() {
        return Err(AppError::Invalid("Capture text is empty".into()));
    }
    let settings = repo::settings::get_all(conn)?;
    let (mut messages, truncated) = ai::actions::messages_at(
        conn,
        "smart_capture",
        &AiInput::Text {
            text: original.clone(),
        },
        settings.ai_max_input_chars,
        now,
    )?;
    if let Some(kind) = target
        && let Some(last) = messages.last_mut()
    {
        last.content.push_str(&target_hint(kind));
    }
    Ok(Analysis {
        original,
        forced: detected.map(|(kind, _)| kind),
        target,
        component_prefix: detected.is_some() && text.trim_start().starts_with("组件"),
        now,
        existing_tags: repo::tags::list(conn)?
            .into_iter()
            .map(|t| t.name)
            .collect(),
        known_tools: PRESET_TOOLS
            .into_iter()
            .map(str::to_string)
            .chain(settings.tips_custom_tools)
            .collect(),
        messages,
        truncated,
    })
}
/// Appended after the template so user edits to `smart_capture` keep working.
fn target_hint(kind: EntityType) -> String {
    let fields = match kind {
        EntityType::Idea => {
            "灵感：source 保留原文，body 不改写；可提取原文中的 dateText，日期由本地规则校验。"
        }
        EntityType::Todo => {
            "待办：提取简洁非空 title、dateText、priority(1–3)；source 逐字摘录原文，备注不得改写；不编造日期。"
        }
        EntityType::Skill => {
            "Skill：提取 title(名称)、description(100字以内)、url；可识别 SKILL.md 的 frontmatter 和正文。source 保留完整对应原文，只有链接时未知名称可留空。"
        }
        EntityType::Prompt => {
            "提示词：提取 title、category、body；body 必须是 source 中逐字摘录的提示词正文，保留 {{变量}}；变量由本地从正文提取，不生成或改写提示词。"
        }
        EntityType::Tip => {
            "Agent 技巧：提取 title、tools(仅已知工具)、url；source 保留原文和命令，body 不改写。"
        }
        EntityType::Material => {
            "作品素材：materialKind 只能 work 或 component；提取 title、url。source/body 保留原文，组件 prompt 必须从该条 source 逐字摘录，不得生成；只有链接时未知标题可留空。"
        }
    };
    format!(
        "\n\n用户已指定目标模块：{}。只输出 type 为 \"{}\" 的条目。独立内容可拆分为最多 10 条同类型条目，返回 {{\"items\":[...]}}；每条 source 必须逐字摘录对应原文，尽量覆盖全部输入，url 只能来自原文。{fields}",
        kind.table(),
        kind.table()
    )
}
/// Collect one ordinary AI stream into a preview; never persist or log its text.
pub async fn analyze(
    ai: &ai::AiService,
    request_id: &str,
    provider: ProviderView,
    key: String,
    analysis: Analysis,
) -> AppResult<CapturePreview> {
    analyze_using(ai, request_id, provider, key, analysis, |_| {}, false).await
}
/// v0.5: same as `analyze`, additionally forwarding every stream event before normalization.
pub async fn analyze_with(
    ai: &ai::AiService,
    request_id: &str,
    provider: ProviderView,
    key: String,
    analysis: Analysis,
    forward: impl Fn(&AiStreamEvent),
) -> AppResult<CapturePreview> {
    analyze_using(ai, request_id, provider, key, analysis, forward, true).await
}
async fn analyze_using(
    ai: &ai::AiService,
    request_id: &str,
    provider: ProviderView,
    key: String,
    analysis: Analysis,
    forward: impl Fn(&AiStreamEvent),
    with_reasoning: bool,
) -> AppResult<CapturePreview> {
    let collected = parking_lot::Mutex::new((String::new(), false, false, None));
    let emit = |event| {
        forward(&event);
        let mut state = collected.lock();
        match event {
            AiStreamEvent::Delta { text } => state.0.push_str(&text),
            AiStreamEvent::Done { .. } => state.1 = true,
            AiStreamEvent::Cancelled => state.2 = true,
            AiStreamEvent::Error { error } => state.3 = Some(error.code),
            _ => {}
        }
        true
    };
    if with_reasoning {
        ai.run_with_reasoning(
            request_id,
            provider,
            key,
            analysis.messages,
            analysis.truncated,
            emit,
        )
        .await?;
    } else {
        ai.run(
            request_id,
            provider,
            key,
            analysis.messages,
            analysis.truncated,
            emit,
        )
        .await?;
    }
    let (text, done, cancelled, error) = collected.into_inner();
    if cancelled {
        return Err(AppError::coded(ErrorCode::Cancelled, "Capture cancelled"));
    }
    if let Some(code) = error {
        return Err(AppError::coded(code, "Capture analysis failed"));
    }
    if !done {
        return Err(AppError::coded(
            ErrorCode::AiBadResponse,
            "Capture stream incomplete",
        ));
    }
    let mut preview = normalize::build_preview(
        &text,
        &normalize::Context {
            original: &analysis.original,
            forced: analysis.forced,
            target: analysis.target,
            now: analysis.now,
            existing_tags: &analysis.existing_tags,
            known_tools: &analysis.known_tools,
        },
        analysis.truncated,
    )?;
    if analysis.component_prefix {
        for item in preview
            .items
            .iter_mut()
            .filter(|i| i.kind == EntityType::Material)
        {
            item.material_kind = Some("component".into());
        }
    }
    Ok(preview)
}

#[cfg(test)]
mod tests;
