use crate::{domain::common::*, error::AppResult, events, repo, state::AppState};
/// List soft-deleted content.
#[tauri::command(async)]
pub fn trash_list(state: tauri::State<'_, AppState>) -> AppResult<Vec<TrashItem>> {
    state.db.with_conn(repo::trash::list)
}
/// Restore deleted content and its search projection.
#[tauri::command(async)]
pub fn trash_restore(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: EntityRef,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &input,
            "restore",
            chrono::Utc::now().timestamp_millis(),
            false,
        )
    })?;
    events::emit_data_changed(&app, "all", "restore")
}
/// Permanently delete a record and relations.
#[tauri::command(async)]
pub fn trash_purge(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: EntityRef,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &input,
            "purge",
            chrono::Utc::now().timestamp_millis(),
            false,
        )
    })?;
    events::emit_data_changed(&app, "all", "purge")
}
/// Permanently empty the recycle bin in one transaction.
#[tauri::command(async)]
pub fn trash_empty(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> AppResult<()> {
    state.db.with_tx(|tx| {
        for item in repo::trash::list(tx)? {
            repo::common::mutate(
                tx,
                &item.r#ref,
                "purge",
                chrono::Utc::now().timestamp_millis(),
                false,
            )?;
        }
        Ok(())
    })?;
    events::emit_data_changed(&app, "all", "purge")
}
