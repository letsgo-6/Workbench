use crate::{
    domain::{backup::BackupInfo, common::IdInput},
    error::AppResult,
    state::AppState,
};
/// List application-owned daily database snapshots.
#[tauri::command(async)]
pub fn backup_list(state: tauri::State<'_, AppState>) -> AppResult<Vec<BackupInfo>> {
    crate::services::backups::list(&state.paths.backups_dir)
}
/// Refresh today's consistent snapshot immediately.
#[tauri::command(async)]
pub fn backup_now(state: tauri::State<'_, AppState>) -> AppResult<BackupInfo> {
    crate::services::backups::now(
        &state.db,
        &state.paths.backups_dir,
        &chrono::Local::now().format("%Y-%m-%d").to_string(),
        true,
    )
}
/// Queue a validated snapshot and restart before replacing the active database.
#[tauri::command(async)]
pub fn backup_restore(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<()> {
    state.paths.queue_restore(&input.id)?;
    app.restart()
}
