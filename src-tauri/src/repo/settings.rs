use crate::{
    domain::settings::Settings,
    error::{AppError, AppResult},
};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
/// Resolve strongly typed settings with defaults for missing keys.
pub fn get_all(conn: &Connection) -> AppResult<Settings> {
    let read = |key: &str| -> AppResult<Option<String>> {
        Ok(conn
            .query_row("SELECT value FROM setting WHERE key=?", [key], |r| r.get(0))
            .optional()?)
    };
    let mut result = Settings::default();
    if let Some(s) = read("appearance.theme")? {
        result.appearance_theme = serde_json::from_str(&s)?;
    }
    if let Some(s) = read("tips.customTools")? {
        result.tips_custom_tools = serde_json::from_str(&s)?;
    }
    if let Some(s) = read("general.closeToTray")? {
        result.general_close_to_tray = serde_json::from_str(&s)?;
    }
    if let Some(s) = read("shortcut.quickCapture")? {
        result.shortcut_quick_capture = serde_json::from_str(&s)?;
    }
    if let Some(s) = read("shortcut.inApp")? {
        let overrides: std::collections::BTreeMap<String, String> = serde_json::from_str(&s)?;
        result.shortcut_in_app.extend(overrides);
    }
    if let Some(s) = read("network.proxy")? {
        result.network_proxy = serde_json::from_str(&s)?;
    }
    if let Some(s) = read("ai.maxInputChars")? {
        result.ai_max_input_chars = serde_json::from_str(&s)?;
    }
    if let Some(s) = read("editor.fontSize")? {
        result.editor_font_size = serde_json::from_str(&s)?;
    }
    if let Some(s) = read("backup.autoEnabled")? {
        result.backup_auto_enabled = serde_json::from_str(&s)?;
    }
    if let Some(s) = read("backup.keep")? {
        result.backup_keep = serde_json::from_str(&s)?;
    }
    if let Some(s) = read("todo.defaultRemindTime")? {
        result.todo_default_remind_time = serde_json::from_str(&s)?;
    }
    if let Some(s) = read("todo.remindersEnabled")? {
        result.todo_reminders_enabled = serde_json::from_str(&s)?;
    }
    Ok(result)
}
/// Reject unknown keys and values before persisting.
pub fn set(tx: &Transaction<'_>, key: &str, value: &serde_json::Value) -> AppResult<Settings> {
    let valid = match key {
        "appearance.theme" => value
            .as_str()
            .is_some_and(|s| ["light", "dark", "system"].contains(&s)),
        "tips.customTools" => value.as_array().is_some_and(|a| {
            a.len() <= 100 && a.iter().all(|v| v.as_str().is_some_and(|s| s.len() <= 200))
        }),
        "general.closeToTray" => value.is_boolean(),
        "shortcut.quickCapture" => value
            .as_str()
            .is_some_and(|s| !s.is_empty() && s.len() <= 100),
        "shortcut.inApp" => value.as_object().is_some_and(|o| {
            !o.is_empty()
                && o.iter().all(|(k, v)| {
                    ["palette", "newItem", "aiDrawer", "filter"].contains(&k.as_str())
                        && v.as_str().is_some_and(|s| !s.is_empty() && s.len() <= 100)
                })
        }),
        "network.proxy" => {
            serde_json::from_value::<crate::domain::settings::NetworkProxy>(value.clone())
                .is_ok_and(|p| match p.mode.as_str() {
                    "system" | "none" => p.url.is_none(),
                    "custom" => p
                        .url
                        .as_deref()
                        .is_some_and(|s| crate::services::providers::validate_url(s).is_ok()),
                    _ => false,
                })
        }
        "ai.maxInputChars" => value.as_u64().is_some_and(|n| (1000..=100000).contains(&n)),
        "editor.fontSize" => value.as_u64().is_some_and(|n| (10..=32).contains(&n)),
        "backup.autoEnabled" | "todo.remindersEnabled" => value.is_boolean(),
        "backup.keep" => value.as_u64() == Some(7),
        "todo.defaultRemindTime" => value
            .as_str()
            .is_some_and(|s| s.len() == 5 && chrono::NaiveTime::parse_from_str(s, "%H:%M").is_ok()),
        _ => false,
    };
    if !valid {
        return Err(AppError::Invalid("Unknown setting or invalid value".into()));
    }
    tx.execute("INSERT INTO setting(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,serde_json::to_string(value)?])?;
    get_all(tx)
}
