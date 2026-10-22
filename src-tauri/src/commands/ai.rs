use crate::{
    domain::{ai::*, common::IdInput, prompt::Prompt},
    error::{AppError, AppResult, ErrorCode},
    events, repo,
    services::ai,
    state::AppState,
};
use tauri::ipc::Channel;
pub(crate) fn credentials(
    state: &AppState,
    id: Option<&str>,
) -> AppResult<(crate::domain::provider::ProviderView, String)> {
    let p = state.db.with_conn(|c| repo::providers::get(c, id))?;
    let key = state
        .secrets
        .get(&p.id)?
        .filter(|k| !k.is_empty())
        .ok_or_else(|| AppError::coded(ErrorCode::AiNoKey, "Missing API credential"))?;
    Ok((p, key))
}
pub(crate) fn validate(id: &str) -> AppResult<()> {
    if uuid::Uuid::parse_str(id).is_err() {
        return Err(AppError::Invalid("Invalid request identifier".into()));
    }
    Ok(())
}
/// Render the saved operation template and stream without mutating source content.
#[tauri::command]
pub async fn ai_run_action(
    state: tauri::State<'_, AppState>,
    input: AiActionInput,
    on_event: Channel<AiStreamEvent>,
) -> AppResult<()> {
    validate(&input.request_id)?;
    let (p, key) = credentials(&state, input.provider_id.as_deref())?;
    let (messages, truncated) = state.db.with_conn(|c| {
        let settings = repo::settings::get_all(c)?;
        ai::actions::messages(c, &input.action, &input.input, settings.ai_max_input_chars)
    })?;
    state
        .ai
        .run(&input.request_id, p, key, messages, truncated, |e| {
            on_event.send(e).is_ok()
        })
        .await
}
/// Persist explicit user turns and completed redacted assistant turns, resolving references in Rust.
#[tauri::command]
pub async fn ai_chat(
    state: tauri::State<'_, AppState>,
    input: AiChatInput,
    on_event: Channel<AiStreamEvent>,
) -> AppResult<String> {
    validate(&input.request_id)?;
    if input.messages.is_empty()
        || input.messages.len() > 100
        || input
            .messages
            .iter()
            .any(|m| !["system", "user", "assistant"].contains(&m.role.as_str()))
        || input
            .messages
            .iter()
            .map(|m| m.content.chars().count())
            .sum::<usize>()
            > 100000
    {
        return Err(AppError::Invalid("Invalid chat messages".into()));
    }
    let (p, key) = credentials(&state, input.provider_id.as_deref())?;
    let conversation_id = input
        .conversation_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::now_v7().to_string());
    validate(&conversation_id)?;
    let (messages, truncated) = state.db.with_tx(|tx| {
        ai::chat::prepare(
            tx,
            &input,
            &conversation_id,
            &p.id,
            &key,
            chrono::Utc::now().timestamp_millis(),
        )
    })?;
    let collected = parking_lot::Mutex::new((String::new(), false));
    state
        .ai
        .run(&input.request_id, p, key, messages, truncated, |e| {
            match &e {
                AiStreamEvent::Delta { text } => collected.lock().0.push_str(text),
                AiStreamEvent::Done { .. } => collected.lock().1 = true,
                _ => {}
            }
            on_event.send(e).is_ok()
        })
        .await?;
    let (answer, done) = collected.into_inner();
    if done {
        state.db.with_tx(|tx| {
            repo::conversations::append(
                tx,
                &conversation_id,
                "assistant",
                &answer,
                &[],
                chrono::Utc::now().timestamp_millis(),
            )
        })?;
    }
    Ok(conversation_id)
}
/// Stop a request belonging to this app process.
#[tauri::command]
pub fn ai_cancel(state: tauri::State<'_, AppState>, input: IdInput) {
    state.ai.cancel(&input.id);
}
/// Return editable built-in templates.
#[tauri::command(async)]
pub fn ai_template_list(state: tauri::State<'_, AppState>) -> AppResult<Vec<Prompt>> {
    state.db.with_conn(ai::actions::list)
}
/// Restore one explicitly chosen template to its compiled default.
#[tauri::command(async)]
pub fn ai_template_reset(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<Prompt> {
    let item = state.db.with_tx(|tx| ai::actions::reset(tx, &input.id))?;
    events::emit_data_changed(&app, "prompt", "update")?;
    Ok(item)
}
#[derive(serde::Deserialize)]
pub struct ParseInput {
    pub action: String,
    pub text: String,
}
/// Parse structured output for an explicit frontend preview.
#[tauri::command(async)]
pub fn ai_parse_result(input: ParseInput) -> AppResult<ParsedAiResult> {
    if input.text.len() > 1_048_576 {
        return Err(AppError::Invalid("AI output too large".into()));
    }
    Ok(ai::parse::result(&input.action, &input.text))
}
