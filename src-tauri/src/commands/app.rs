use crate::{error::AppResult, state::AppState};
use tauri::Manager;
/// Allow lightweight entry points to wait until both state and desktop setup are usable.
#[tauri::command]
pub fn app_ready(app: tauri::AppHandle) -> bool {
    app.try_state::<crate::state::Ready>()
        .is_some_and(|ready| ready.0.load(std::sync::atomic::Ordering::Acquire))
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: &'static str,
    data_dir: String,
    db_path: String,
}
/// Show diagnostic paths without exposing credentials.
#[tauri::command(async)]
pub fn app_info(state: tauri::State<'_, AppState>) -> AppResult<AppInfo> {
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        data_dir: state.paths.data_dir.to_string_lossy().into(),
        db_path: state.paths.db_path.to_string_lossy().into(),
    })
}
