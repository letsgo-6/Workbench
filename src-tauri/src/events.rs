use crate::error::AppResult;
use serde::Serialize;
use tauri::Emitter;
#[derive(Clone, Serialize)]
struct DataChanged<'a> {
    entity: &'a str,
    op: &'a str,
}
/// Notify every window after the transaction has committed.
pub fn emit_data_changed(app: &tauri::AppHandle, entity: &str, op: &str) -> AppResult<()> {
    app.emit("data-changed", DataChanged { entity, op })
        .map_err(|e| crate::error::AppError::Invalid(e.to_string()))
}
