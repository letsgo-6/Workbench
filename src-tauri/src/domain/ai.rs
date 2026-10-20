use super::common::EntityRef;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}
#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum AiInput {
    Text { text: String },
    Entities { refs: Vec<EntityRef> },
}
#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AiActionInput {
    pub request_id: String,
    pub action: String,
    pub provider_id: Option<String>,
    pub input: AiInput,
    pub extra: Option<std::collections::HashMap<String, String>>,
}
#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AiChatInput {
    pub request_id: String,
    pub provider_id: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub conversation_id: Option<String>,
    #[serde(default)]
    pub refs: Vec<EntityRef>,
}
#[derive(Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum AiStreamEvent {
    Started {
        model: String,
        truncated: bool,
    },
    Delta {
        text: String,
    },
    Done {
        finish_reason: Option<String>,
    },
    Cancelled,
    Error {
        error: crate::error::AppErrorPayload,
    },
}
#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ParsedAiResult {
    pub kind: String,
    pub text: String,
    pub changes: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub valid: bool,
    pub todos: Vec<BreakdownTodo>,
}
#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BreakdownTodo {
    pub title: String,
    #[serde(default)]
    pub note: String,
    pub due_date: Option<String>,
    #[serde(default = "default_priority")]
    pub priority: i32,
}
fn default_priority() -> i32 {
    2
}
