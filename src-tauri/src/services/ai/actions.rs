use crate::{
    domain::{ai::*, prompt::Prompt},
    error::{AppError, AppResult},
    repo,
    services::template,
};
use rusqlite::{Connection, Transaction, params};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
const OLD_CAPTURE_BODY_SHA256: &str =
    "20c7e0d26999f740bbc0792e5ec0b7bea3e2ffcfb9b1bf3ae410fd8423796822";
const OLD_CAPTURE_SYSTEM_SHA256: &str =
    "ab2aabc5976890e15381e74f75438b4f694be01fdfbbe2d1eb5dae094a0a00bd";
pub const KEYS: [&str; 13] = [
    "polish",
    "shorten",
    "expand",
    "summarize",
    "categorize",
    "merge_note",
    "title_tags",
    "extract_tip",
    "optimize_prompt",
    "skill_describe",
    "breakdown_todos",
    "daily_summary",
    "smart_capture",
];
const DEFAULTS: [(&str, &str); 13] = [
    ("润色优化", include_str!("../../../templates/polish.md")),
    ("精简", include_str!("../../../templates/shorten.md")),
    ("扩写", include_str!("../../../templates/expand.md")),
    ("总结要点", include_str!("../../../templates/summarize.md")),
    ("归类整理", include_str!("../../../templates/categorize.md")),
    (
        "合并为笔记",
        include_str!("../../../templates/merge_note.md"),
    ),
    (
        "生成标题与标签",
        include_str!("../../../templates/title_tags.md"),
    ),
    (
        "提炼技巧卡片",
        include_str!("../../../templates/extract_tip.md"),
    ),
    (
        "优化提示词",
        include_str!("../../../templates/optimize_prompt.md"),
    ),
    (
        "生成 Skill 简介与标签",
        include_str!("../../../templates/skill_describe.md"),
    ),
    (
        "拆解待办",
        include_str!("../../../templates/breakdown_todos.md"),
    ),
    (
        "每日小结",
        include_str!("../../../templates/daily_summary.md"),
    ),
    (
        "智能整理",
        include_str!("../../../templates/smart_capture.md"),
    ),
];
fn defaults(index: usize) -> (&'static str, &'static str, &'static str) {
    let (name, raw) = DEFAULTS[index];
    let (system, body) = raw
        .trim_start_matches("---system---\n")
        .split_once("---user---\n")
        .unwrap_or(("", raw));
    (name, system.trim(), body.trim())
}
/// Seed only absent templates, preserving every user edit on subsequent starts.
pub fn seed_system_templates(tx: &Transaction<'_>) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp_millis();
    for (i, key) in KEYS.iter().enumerate() {
        let (title, system, body) = defaults(i);
        if *key == "smart_capture" {
            let previous = tx.query_row(
                "SELECT body,coalesce(system_prompt,'') FROM prompt WHERE template_key=?",
                [key],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            );
            if let Ok((old_body, old_system)) = previous
                && crate::services::assets::hex(Sha256::digest(old_body.as_bytes()).as_ref())
                    == OLD_CAPTURE_BODY_SHA256
                && crate::services::assets::hex(Sha256::digest(old_system.as_bytes()).as_ref())
                    == OLD_CAPTURE_SYSTEM_SHA256
            {
                tx.execute("UPDATE prompt SET body=?,system_prompt=?,variables=?,updated_at=? WHERE template_key=?",params![body,system,serde_json::to_string(&template::variables(body))?,now,key])?;
            }
        }
        tx.execute("INSERT OR IGNORE INTO prompt(id,title,body,system_prompt,variables,category,is_system_template,template_key,created_at,updated_at) VALUES (?,?,?,?,?,'系统模板',1,?,?,?)",params![uuid::Uuid::now_v7().to_string(),title,body,system,serde_json::to_string(&template::variables(body))?,key,now,now])?;
    }
    Ok(())
}
/// Return system templates in operation order.
pub fn list(conn: &Connection) -> AppResult<Vec<Prompt>> {
    let mut out = vec![];
    for key in KEYS {
        let id: String =
            conn.query_row("SELECT id FROM prompt WHERE template_key=?", [key], |r| {
                r.get(0)
            })?;
        let mut prompt = repo::prompts::get(conn, &id)?;
        if key == "smart_capture" {
            let (_, system, body) = defaults(KEYS.len() - 1);
            prompt.has_new_default =
                Some(prompt.body != body || prompt.system_prompt.as_deref() != Some(system));
        }
        out.push(prompt);
    }
    Ok(out)
}
/// Restore only the explicitly chosen template.
pub fn reset(tx: &Transaction<'_>, key: &str) -> AppResult<Prompt> {
    let i = KEYS
        .iter()
        .position(|k| *k == key)
        .ok_or_else(|| AppError::Invalid("Unknown AI action".into()))?;
    let (title, system, body) = defaults(i);
    tx.execute("UPDATE prompt SET title=?,body=?,system_prompt=?,variables=?,updated_at=? WHERE template_key=?",params![title,body,system,serde_json::to_string(&template::variables(body))?,chrono::Utc::now().timestamp_millis(),key])?;
    let id: String = tx.query_row("SELECT id FROM prompt WHERE template_key=?", [key], |r| {
        r.get(0)
    })?;
    repo::prompts::get(tx, &id)
}
/// Render a saved template with trusted context variables, without changing any source.
pub fn messages(
    conn: &Connection,
    action: &str,
    input: &AiInput,
    limit: usize,
) -> AppResult<(Vec<ChatMessage>, bool)> {
    messages_at(
        conn,
        action,
        input,
        limit,
        chrono::Local::now().naive_local(),
    )
}
/// Render capture prompts against the same local clock used for date normalization.
pub fn messages_at(
    conn: &Connection,
    action: &str,
    input: &AiInput,
    limit: usize,
    now: chrono::NaiveDateTime,
) -> AppResult<(Vec<ChatMessage>, bool)> {
    if !KEYS.contains(&action) {
        return Err(AppError::Invalid("Unknown AI action".into()));
    }
    let daily;
    let source = if action == "daily_summary" {
        use chrono::TimeZone;
        let date = chrono::Local::now().date_naive();
        let midnight = |date: chrono::NaiveDate| {
            date.and_hms_opt(0, 0, 0)
                .and_then(|d| chrono::Local.from_local_datetime(&d).earliest())
                .map(|d| d.timestamp_millis())
                .ok_or_else(|| AppError::Invalid("Invalid local day".into()))
        };
        let next = date
            .succ_opt()
            .ok_or_else(|| AppError::Invalid("Invalid local day".into()))?;
        daily = AiInput::Text {
            text: super::context::daily(conn, &date.to_string(), midnight(date)?, midnight(next)?)?,
        };
        &daily
    } else {
        input
    };
    let (text, truncated) = super::context::build(conn, source, limit)?;
    let (body, system): (String, Option<String>) = conn.query_row(
        "SELECT body,system_prompt FROM prompt WHERE template_key=? AND deleted_at IS NULL",
        [action],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let tags = repo::tags::list(conn)?
        .into_iter()
        .take(200)
        .map(|t| t.name)
        .collect::<Vec<_>>()
        .join(", ");
    use chrono::Datelike;
    let weekday = [
        "星期一",
        "星期二",
        "星期三",
        "星期四",
        "星期五",
        "星期六",
        "星期日",
    ][now.weekday().num_days_from_monday() as usize];
    let settings = repo::settings::get_all(conn)?;
    let tools = crate::domain::tip::PRESET_TOOLS
        .into_iter()
        .map(str::to_string)
        .chain(settings.tips_custom_tools)
        .collect::<Vec<_>>()
        .join("、");
    let values: HashMap<String, String> = [
        ("input", text.clone()),
        ("items", text),
        ("existing_tags", tags),
        ("today", now.format("%Y-%m-%d").to_string()),
        ("now", format!("{} {weekday}", now.format("%Y-%m-%d %H:%M"))),
        ("known_tools", tools),
    ]
    .into_iter()
    .map(|(k, v)| (k.into(), v))
    .collect();
    Ok((
        vec![
            ChatMessage {
                role: "system".into(),
                content: system.unwrap_or_default(),
            },
            ChatMessage {
                role: "user".into(),
                content: template::render(&body, &values),
            },
        ],
        truncated,
    ))
}
