use super::common::EntityRef;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PromptVersion {
    pub id: String,
    pub prompt_id: String,
    pub title: String,
    pub body: String,
    pub system_prompt: Option<String>,
    #[ts(type = "number")]
    pub created_at: i64,
}
#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub provider_id: Option<String>,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
}
#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SavedMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub refs: Vec<EntityRef>,
    #[ts(type = "number")]
    pub created_at: i64,
}
#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConversationDetail {
    pub conversation: Conversation,
    pub messages: Vec<SavedMessage>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameInput {
    pub id: String,
    pub title: String,
}
