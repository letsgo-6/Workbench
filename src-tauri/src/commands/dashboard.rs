use crate::{domain::dashboard::Dashboard, error::AppResult, repo, state::AppState};
/// Read today's local dashboard.
#[tauri::command(async)]
pub fn dashboard_get(state: tauri::State<'_, AppState>) -> AppResult<Dashboard> {
    let (today, start, end) = super::local_day()?;
    state
        .db
        .with_conn(|c| repo::dashboard::get(c, &today, start, end))
}
