use crate::error::{AppError, AppResult};
use tauri::{Emitter, Manager};
/// Show the existing main window for tray and second-instance activation.
pub fn show_main(app: &tauri::AppHandle) -> AppResult<()> {
    let w = app.get_webview_window("main").ok_or(AppError::NotFound)?;
    w.show()
        .map_err(|_| AppError::Invalid("Cannot show main window".into()))?;
    let _ = w.unminimize();
    let _ = w.emit("main-window-visibility", true);
    w.set_focus()
        .map_err(|_| AppError::Invalid("Cannot focus main window".into()))
}
/// Toggle the pre-created quick WebView; no window creation is on the hot path.
pub fn quick(app: &tauri::AppHandle) -> AppResult<()> {
    let w = app.get_webview_window("quick").ok_or(AppError::NotFound)?;
    if w.is_visible().unwrap_or(false) {
        w.hide()
            .map_err(|_| AppError::Invalid("Cannot hide quick window".into()))?;
    } else {
        let _ = w.center();
        w.show()
            .map_err(|_| AppError::Invalid("Cannot show quick window".into()))?;
        w.set_focus()
            .map_err(|_| AppError::Invalid("Cannot focus quick window".into()))?;
        w.emit("quick-shown", ())
            .map_err(|_| AppError::Invalid("Cannot notify quick window".into()))?;
    }
    Ok(())
}
