use crate::{domain::settings::Settings, error::AppResult, events, repo, state::AppState};
#[derive(serde::Deserialize)]
pub struct SettingInput {
    pub key: String,
    pub value: serde_json::Value,
}
/// Read batch-one settings.
#[tauri::command(async)]
pub fn settings_get_all(state: tauri::State<'_, AppState>) -> AppResult<Settings> {
    state.db.with_conn(repo::settings::get_all)
}
/// Persist a known setting and synchronize all windows.
#[tauri::command(async)]
pub fn settings_set(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: SettingInput,
) -> AppResult<Settings> {
    if input.key == "shortcut.quickCapture" {
        return Err(crate::error::AppError::Invalid(
            "Use shortcut_update".into(),
        ));
    }
    let old = state.db.with_conn(repo::settings::get_all)?;
    if input.key == "network.proxy" {
        let proxy: crate::domain::settings::NetworkProxy =
            serde_json::from_value(input.value.clone())?;
        state.ai.configure(&proxy)?;
    }
    if input.key == "shortcut.inApp"
        && let Some(object) = input.value.as_object()
    {
        let mut seen = std::collections::HashSet::new();
        for value in object.values() {
            let Some(text) = value.as_str() else {
                return Err(crate::error::AppError::Invalid("Invalid shortcut".into()));
            };
            let parsed = text
                .parse::<tauri_plugin_global_shortcut::Shortcut>()
                .map_err(|_| {
                    crate::error::AppError::coded(
                        crate::error::ErrorCode::ShortcutInvalid,
                        "Invalid shortcut",
                    )
                })?;
            if !seen.insert(parsed.id()) {
                return Err(crate::error::AppError::coded(
                    crate::error::ErrorCode::ShortcutInvalid,
                    "Invalid or duplicate shortcut",
                ));
            }
        }
    }
    let result = state
        .db
        .with_tx(|tx| repo::settings::set(tx, &input.key, &input.value));
    let result = match result {
        Ok(r) => r,
        Err(e) => {
            if input.key == "network.proxy" {
                state.ai.configure(&old.network_proxy)?;
            }
            return Err(e);
        }
    };
    events::emit_data_changed(&app, "setting", "update")?;
    Ok(result)
}
