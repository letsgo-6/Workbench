use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Settings {
    pub appearance_theme: String,
    pub appearance_motion: String,
    pub home_intro: String,
    pub tips_custom_tools: Vec<String>,
    pub general_close_to_tray: bool,
    pub shortcut_quick_capture: String,
    pub shortcut_in_app: std::collections::BTreeMap<String, String>,
    pub network_proxy: NetworkProxy,
    pub ai_max_input_chars: usize,
    pub editor_font_size: u32,
    pub backup_auto_enabled: bool,
    pub backup_keep: u32,
    pub todo_default_remind_time: String,
    pub todo_reminders_enabled: bool,
    pub capture_default_target: super::common::EntityType,
    pub capture_auto_save: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NetworkProxy {
    pub mode: String,
    pub url: Option<String>,
}
impl Default for NetworkProxy {
    fn default() -> Self {
        Self {
            mode: "system".into(),
            url: None,
        }
    }
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            appearance_theme: "system".into(),
            appearance_motion: "system".into(),
            home_intro: "daily".into(),
            tips_custom_tools: vec![],
            general_close_to_tray: true,
            shortcut_quick_capture: "Alt+Space".into(),
            shortcut_in_app: [
                ("palette", "Ctrl+K"),
                ("newItem", "Ctrl+N"),
                ("aiDrawer", "Ctrl+J"),
                ("filter", "Ctrl+F"),
            ]
            .into_iter()
            .map(|(k, v)| (k.into(), v.into()))
            .collect(),
            network_proxy: NetworkProxy::default(),
            ai_max_input_chars: 24000,
            editor_font_size: 14,
            backup_auto_enabled: true,
            backup_keep: 7,
            todo_default_remind_time: "09:00".into(),
            todo_reminders_enabled: true,
            capture_default_target: super::common::EntityType::Idea,
            capture_auto_save: false,
        }
    }
}
