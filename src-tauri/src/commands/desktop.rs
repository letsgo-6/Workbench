use crate::{desktop, error::AppResult, events, state::AppState};
#[derive(serde::Deserialize)]
pub struct ShortcutInput {
    pub action: String,
    pub accelerator: String,
}
/// Expose startup registration failure as state, never as an application crash.
#[tauri::command]
pub fn shortcut_status(state: tauri::State<'_, AppState>) -> desktop::shortcut::ShortcutStatus {
    state.shortcuts.status.lock().clone()
}
/// Validate a replacement before releasing the active global shortcut.
#[tauri::command]
pub fn shortcut_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: ShortcutInput,
) -> AppResult<desktop::shortcut::ShortcutStatus> {
    if input.action != "quickCapture" {
        return Err(crate::error::AppError::Invalid(
            "Unknown shortcut action".into(),
        ));
    }
    let result = desktop::shortcut::update(&app, &state, &input.accelerator, true)?;
    events::emit_data_changed(&app, "setting", "update")?;
    Ok(result)
}
/// Show the existing main window.
#[tauri::command]
pub fn window_show_main(app: tauri::AppHandle) -> AppResult<()> {
    desktop::windows::show_main(&app)
}
/// Install translated tray menu labels from the application's locale.
#[tauri::command]
pub fn desktop_set_labels(
    app: tauri::AppHandle,
    input: desktop::tray::TrayLabels,
) -> AppResult<()> {
    desktop::tray::labels(&app, input)
}
#[derive(serde::Deserialize)]
pub struct QuickWindowInput {
    pub height: u32,
    pub theme: Option<String>,
}
/// Resize and theme only the calling quick window without extra plugin permissions.
#[tauri::command]
pub fn quick_sync_window(window: tauri::WebviewWindow, input: QuickWindowInput) -> AppResult<()> {
    if window.label() != "quick" {
        return Err(crate::error::AppError::Invalid(
            "Quick window required".into(),
        ));
    }
    window
        .set_size(tauri::LogicalSize::new(560, input.height.clamp(120, 240)))
        .map_err(|_| crate::error::AppError::Invalid("Cannot resize quick window".into()))?;
    let theme = match input.theme.as_deref() {
        Some("dark") => Some(tauri::Theme::Dark),
        Some("light") => Some(tauri::Theme::Light),
        None => None,
        _ => return Err(crate::error::AppError::Invalid("Invalid theme".into())),
    };
    window
        .set_theme(theme)
        .map_err(|_| crate::error::AppError::Invalid("Cannot theme quick window".into()))
}
