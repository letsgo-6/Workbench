use crate::error::{AppError, AppResult};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLabels {
    pub show_main: String,
    pub quick_capture: String,
    pub quit: String,
}
/// Build one tray icon; menu labels arrive from the centralized frontend locale.
pub fn create(app: &tauri::AppHandle) -> AppResult<()> {
    let mut builder = TrayIconBuilder::with_id("workbench")
        .tooltip("Workbench")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                let _ = super::windows::show_main(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "main" => {
                let _ = super::windows::show_main(app);
            }
            "quick" => {
                let _ = super::windows::quick(app);
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder
        .build(app)
        .map_err(|_| AppError::Invalid("Cannot create tray icon".into()))?;
    Ok(())
}
/// Keep every translated label in src/i18n/zh-CN.ts.
pub fn labels(app: &tauri::AppHandle, input: TrayLabels) -> AppResult<()> {
    if [&input.show_main, &input.quick_capture, &input.quit]
        .iter()
        .any(|s| s.is_empty() || s.len() > 200)
    {
        return Err(AppError::Invalid("Invalid tray labels".into()));
    }
    let result = (|| -> tauri::Result<()> {
        let main = MenuItem::with_id(app, "main", input.show_main, true, None::<&str>)?;
        let quick = MenuItem::with_id(app, "quick", input.quick_capture, true, None::<&str>)?;
        let quit = MenuItem::with_id(app, "quit", input.quit, true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&main, &quick, &quit])?;
        if let Some(tray) = app.tray_by_id("workbench") {
            tray.set_menu(Some(menu))?;
        }
        Ok(())
    })();
    result.map_err(|_| AppError::Invalid("Cannot update tray menu".into()))
}
