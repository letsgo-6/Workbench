use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
/// Start nonfatal backup and reminder jobs after state registration.
pub fn start(app: &tauri::AppHandle) {
    let handle = app.clone();
    let click = app.clone();
    if app
        .notification()
        .on_action(move |event| {
            if let Some(id) = event
                .notification()
                .and_then(|n| n.extra().get("todoId"))
                .and_then(serde_json::Value::as_str)
                && uuid::Uuid::parse_str(id).is_ok()
            {
                let _ = super::windows::show_main(&click);
                if let Some(window) = click.get_webview_window("main") {
                    let _ = window.eval(format!(
                        "location.hash={}",
                        serde_json::json!(format!("/todos/{id}"))
                    ));
                }
            }
        })
        .is_err()
    {
        log::warn!(target:"workbench","Notification listener unavailable");
    }
    tauri::async_runtime::spawn(async move {
        let mut ticks = 0u64;
        loop {
            let task = handle.clone();
            let backup_due = ticks.is_multiple_of(2880);
            let _ = tauri::async_runtime::spawn_blocking(move || {
                let state = task.state::<crate::state::AppState>();
                if backup_due
                    && state
                        .db
                        .with_conn(crate::repo::settings::get_all)
                        .is_ok_and(|s| s.backup_auto_enabled)
                    && crate::services::backups::now(
                        &state.db,
                        &state.paths.backups_dir,
                        &chrono::Local::now().format("%Y-%m-%d").to_string(),
                        true,
                    )
                    .is_err()
                {
                    log::warn!(target:"workbench","Automatic backup failed");
                    let _ = task.emit("backup-failed", ());
                }
                let result = crate::services::reminders::dispatch(
                    &state.db,
                    chrono::Utc::now().timestamp_millis(),
                    |todo| {
                        task.notification()
                            .builder()
                            .title(&todo.title)
                            .body(&todo.note_md)
                            .extra("todoId", &todo.id)
                            .show()
                            .map_err(|_| {
                                crate::error::AppError::Invalid("Notification unavailable".into())
                            })
                    },
                );
                match result {
                    Ok(n) if n > 0 => {
                        let _ = crate::events::emit_data_changed(&task, "todo", "update");
                    }
                    Err(_) => log::warn!(target:"workbench","Reminder delivery failed"),
                    _ => {}
                }
            })
            .await;
            ticks += 1;
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        }
    });
}
