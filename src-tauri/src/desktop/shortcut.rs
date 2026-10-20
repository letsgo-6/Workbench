use crate::{
    error::{AppError, AppResult, ErrorCode},
    repo,
    state::AppState,
};
use parking_lot::Mutex;
use serde::Serialize;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use ts_rs::TS;
#[derive(Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ShortcutStatus {
    pub accelerator: String,
    pub active: Option<String>,
    pub error: Option<String>,
}
pub struct Shortcuts {
    pub status: Mutex<ShortcutStatus>,
}
impl Default for Shortcuts {
    fn default() -> Self {
        Self {
            status: Mutex::new(ShortcutStatus {
                accelerator: "Alt+Space".into(),
                active: None,
                error: None,
            }),
        }
    }
}
fn parse(value: &str) -> AppResult<Shortcut> {
    value
        .parse()
        .map_err(|_| AppError::coded(ErrorCode::ShortcutInvalid, "Invalid accelerator"))
}
/// Register first, persist second, then unregister the old shortcut.
pub fn update(
    app: &tauri::AppHandle,
    state: &AppState,
    value: &str,
    persist: bool,
) -> AppResult<ShortcutStatus> {
    let mut status = state.shortcuts.status.lock();
    status.accelerator = value.into();
    let new = match parse(value) {
        Ok(s) => s,
        Err(e) => {
            status.error = Some("SHORTCUT_INVALID".into());
            return Err(e);
        }
    };
    if status.active.as_deref() == Some(value) {
        status.error = None;
        return Ok(status.clone());
    }
    if app
        .global_shortcut()
        .on_shortcut(new, |app, _, event| {
            if event.state == ShortcutState::Pressed {
                let _ = super::windows::quick(app);
            }
        })
        .is_err()
    {
        status.error = Some("SHORTCUT_CONFLICT".into());
        log::warn!(target:"workbench","Global shortcut registration failed");
        return Err(AppError::coded(
            ErrorCode::ShortcutConflict,
            "Global shortcut unavailable",
        ));
    }
    if persist
        && let Err(error) = state.db.with_tx(|tx| {
            repo::settings::set(tx, "shortcut.quickCapture", &serde_json::json!(value))
        })
    {
        let _ = app.global_shortcut().unregister(new);
        return Err(error);
    }
    if let Some(old) = &status.active
        && let Ok(old) = parse(old)
    {
        let _ = app.global_shortcut().unregister(old);
    }
    status.active = Some(value.into());
    status.error = None;
    Ok(status.clone())
}
