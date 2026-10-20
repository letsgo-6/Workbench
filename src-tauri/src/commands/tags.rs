use crate::{domain::common::*, error::AppResult, events, repo, state::AppState};
#[derive(serde::Deserialize)]
pub struct RenameInput {
    pub id: String,
    pub name: String,
}
#[derive(serde::Deserialize)]
pub struct ColorInput {
    pub id: String,
    pub color: Option<String>,
}
/// List all known tags.
#[tauri::command(async)]
pub fn tag_list(state: tauri::State<'_, AppState>) -> AppResult<Vec<Tag>> {
    state.db.with_conn(repo::tags::list)
}
/// Rename a tag and its indexed occurrences.
#[tauri::command(async)]
pub fn tag_rename(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: RenameInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::tags::change(
            tx,
            &input.id,
            Some(&input.name),
            None,
            false,
            chrono::Utc::now().timestamp_millis(),
        )
    })?;
    events::emit_data_changed(&app, "tag", "update")
}
/// Delete the tag, retaining its content records.
#[tauri::command(async)]
pub fn tag_delete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::tags::change(
            tx,
            &input.id,
            None,
            None,
            true,
            chrono::Utc::now().timestamp_millis(),
        )
    })?;
    events::emit_data_changed(&app, "tag", "delete")
}
/// Set an optional tag color.
#[tauri::command(async)]
pub fn tag_set_color(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: ColorInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::tags::change(
            tx,
            &input.id,
            None,
            input.color.as_deref(),
            false,
            chrono::Utc::now().timestamp_millis(),
        )
    })?;
    events::emit_data_changed(&app, "tag", "update")
}
