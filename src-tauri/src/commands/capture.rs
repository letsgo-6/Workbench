use crate::{
    domain::{
        ai::AiStreamEvent, capture::*, common::EntityType, idea::IdeaInput, prompt::PromptInput,
        skill::SkillInput, tip::TipInput, todo::TodoInput,
    },
    error::{AppError, AppResult},
    events,
    services::capture::{
        self,
        persistence::{self, PreparedItem},
    },
    state::AppState,
};
use tauri::ipc::Channel;

/// Analyze without changing the database, exposing no provider credentials.
#[tauri::command]
pub async fn capture_analyze(
    state: tauri::State<'_, AppState>,
    input: CaptureAnalyzeInput,
) -> AppResult<CapturePreview> {
    super::ai::validate(&input.request_id)?;
    if input.text.trim().is_empty() || input.text.chars().count() > 20_000 {
        return Err(AppError::Invalid(
            "Capture requires 1–20000 characters".into(),
        ));
    }
    let (provider, key) = super::ai::credentials(&state, input.provider_id.as_deref())?;
    let now = chrono::Local::now().naive_local();
    let analysis = state
        .db
        .with_conn(|conn| capture::prepare_for(conn, &input.text, input.target, now))?;
    capture::analyze(&state.ai, &input.request_id, provider, key, analysis).await
}
/// v0.5: streaming variant for the home composer's process panel; still never writes the database.
#[tauri::command]
pub async fn capture_analyze_stream(
    state: tauri::State<'_, AppState>,
    input: CaptureAnalyzeInput,
    on_event: Channel<CaptureStreamEvent>,
) -> AppResult<CapturePreview> {
    super::ai::validate(&input.request_id)?;
    if input.text.trim().is_empty() || input.text.chars().count() > 20_000 {
        return Err(AppError::Invalid(
            "Capture requires 1–20000 characters".into(),
        ));
    }
    let stage = |stage, model| {
        let _ = on_event.send(CaptureStreamEvent::Stage { stage, model });
    };
    stage(CaptureStage::Preparing, None);
    let (provider, key) = super::ai::credentials(&state, input.provider_id.as_deref())?;
    let now = chrono::Local::now().naive_local();
    let analysis = state
        .db
        .with_conn(|conn| capture::prepare_for(conn, &input.text, input.target, now))?;
    let streaming = std::sync::atomic::AtomicBool::new(false);
    let preview = capture::analyze_with(
        &state.ai,
        &input.request_id,
        provider,
        key,
        analysis,
        |event| match event {
            AiStreamEvent::Started { model, .. } => {
                stage(CaptureStage::Requesting, Some(model.clone()))
            }
            AiStreamEvent::Delta { text } => {
                if !streaming.swap(true, std::sync::atomic::Ordering::Relaxed) {
                    stage(CaptureStage::Streaming, None);
                }
                let _ = on_event.send(CaptureStreamEvent::Delta { text: text.clone() });
            }
            AiStreamEvent::Reasoning { text } => {
                if !streaming.swap(true, std::sync::atomic::Ordering::Relaxed) {
                    stage(CaptureStage::Streaming, None);
                }
                let _ = on_event.send(CaptureStreamEvent::Reasoning { text: text.clone() });
            }
            AiStreamEvent::Done { .. } => stage(CaptureStage::Normalizing, None),
            _ => {}
        },
    )
    .await?;
    stage(CaptureStage::Ready, None);
    Ok(preview)
}

fn checked<T: serde::Serialize>(
    mut value: T,
    prepare: impl FnOnce(&mut T) -> AppResult<()>,
) -> AppResult<T> {
    prepare(&mut value)?;
    super::validate(&serde_json::to_value(&value)?)?;
    Ok(value)
}
fn prepare_items(items: Vec<CaptureItem>) -> AppResult<Vec<PreparedItem>> {
    if items.is_empty() || items.len() > 10 {
        return Err(AppError::Invalid("Choose 1–10 capture items".into()));
    }
    items
        .into_iter()
        .map(|i| {
            Ok(match i.kind {
                EntityType::Material => PreparedItem::Material(checked(
                    crate::domain::material::MaterialInput {
                        kind: i.material_kind.unwrap_or_else(|| "work".into()),
                        title: i.title,
                        url: i.url,
                        note_md: i.body,
                        prompt: if i.source.contains(&i.material_prompt) {
                            i.material_prompt
                        } else {
                            String::new()
                        },
                        tags: i.tags,
                        ..Default::default()
                    },
                    crate::services::assets::validate_input,
                )?),
                EntityType::Idea => PreparedItem::Idea(checked(
                    IdeaInput {
                        content_md: i.body,
                        date: i.date.unwrap_or_default(),
                        tags: i.tags,
                    },
                    super::prepare_idea,
                )?),
                EntityType::Todo => PreparedItem::Todo(checked(
                    TodoInput {
                        title: i.title,
                        note_md: i.body,
                        due_date: i.due_date,
                        remind_at: i.remind_at,
                        priority: i.priority,
                        tags: i.tags,
                        ..Default::default()
                    },
                    super::prepare_todo,
                )?),
                EntityType::Tip => PreparedItem::Tip(checked(
                    TipInput {
                        title: i.title,
                        content_md: i.body,
                        tools: i.tools,
                        source_url: i.url,
                        tags: i.tags,
                    },
                    super::prepare_tip,
                )?),
                EntityType::Skill => PreparedItem::Skill(checked(
                    SkillInput {
                        name: i.title,
                        description: i.description,
                        content_md: i.skill_content,
                        url: i.url,
                        note: i.body,
                        tags: i.tags,
                        ..Default::default()
                    },
                    super::prepare_skill,
                )?),
                EntityType::Prompt => PreparedItem::Prompt(checked(
                    PromptInput {
                        title: i.title,
                        body: i.body,
                        category: i.category,
                        tags: i.tags,
                        ..Default::default()
                    },
                    super::prepare_prompt,
                )?),
            })
        })
        .collect()
}
/// Validate every reviewed item before opening the single write transaction.
#[tauri::command(async)]
pub fn capture_commit(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: CaptureCommitInput,
) -> AppResult<CaptureCommitResult> {
    let prepared = prepare_items(input.items)?;
    let result = state
        .db
        .with_tx(|tx| persistence::commit(tx, &prepared, chrono::Utc::now().timestamp_millis()))?;
    events::emit_data_changed(&app, "all", "create")?;
    Ok(result)
}
/// Undo a capture without placing its unchanged records in the recycle bin.
#[tauri::command(async)]
pub fn capture_undo(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: CaptureUndoInput,
) -> AppResult<CaptureUndoResult> {
    if input.refs.is_empty() || input.refs.len() > 10 {
        return Err(AppError::Invalid("Choose 1–10 capture references".into()));
    }
    for r in &input.refs {
        super::ai::validate(&r.id)?;
    }
    let result = state
        .db
        .with_tx(|tx| persistence::undo(tx, &input, chrono::Utc::now().timestamp_millis()))?;
    events::emit_data_changed(&app, "all", "purge")?;
    Ok(result)
}

#[cfg(test)]
#[path = "capture_tests.rs"]
mod tests;
