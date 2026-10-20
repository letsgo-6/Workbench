use crate::{
    domain::{common::IdInput, history::*},
    error::AppResult,
    events, repo,
    state::AppState,
};
/// Read prompt snapshots for the selected live prompt.
#[tauri::command(async)]
pub fn prompt_version_list(
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<Vec<PromptVersion>> {
    state.db.with_conn(|c| repo::versions::list(c, &input.id))
}
/// Save a changed editing session, never every autosave tick.
#[tauri::command(async)]
pub fn prompt_version_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<Option<PromptVersion>> {
    let result = state.db.with_tx(|tx| {
        repo::versions::create(tx, &input.id, chrono::Utc::now().timestamp_millis(), false)
    })?;
    events::emit_data_changed(&app, "prompt", "update")?;
    Ok(result)
}
/// Roll back only after explicit confirmation in the UI.
#[tauri::command(async)]
pub fn prompt_version_restore(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<crate::domain::prompt::Prompt> {
    let result = state.db.with_tx(|tx| {
        repo::versions::restore(tx, &input.id, chrono::Utc::now().timestamp_millis())
    })?;
    events::emit_data_changed(&app, "prompt", "update")?;
    Ok(result)
}
/// List persisted live conversations.
#[tauri::command(async)]
pub fn ai_conversation_list(state: tauri::State<'_, AppState>) -> AppResult<Vec<Conversation>> {
    state.db.with_conn(repo::conversations::list)
}
/// Read a conversation's source messages and reference metadata.
#[tauri::command(async)]
pub fn ai_conversation_get(
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<ConversationDetail> {
    state
        .db
        .with_conn(|c| repo::conversations::get(c, &input.id))
}
/// Rename a live conversation without changing messages.
#[tauri::command(async)]
pub fn ai_conversation_rename(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: RenameInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::conversations::change(
            tx,
            &input.id,
            Some(&input.title),
            chrono::Utc::now().timestamp_millis(),
        )
    })?;
    events::emit_data_changed(&app, "all", "update")
}
/// Soft-delete history so full backups can still recover it.
#[tauri::command(async)]
pub fn ai_conversation_delete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::conversations::change(tx, &input.id, None, chrono::Utc::now().timestamp_millis())
    })?;
    events::emit_data_changed(&app, "all", "delete")
}
