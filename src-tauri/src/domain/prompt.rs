use super::common::{Origin, Tag};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Prompt {
    pub id: String,
    pub title: String,
    pub body: String,
    pub system_prompt: Option<String>,
    pub category: String,
    pub target_model: Option<String>,
    pub variables: Vec<String>,
    pub use_count: i32,
    pub is_system_template: bool,
    pub template_key: Option<String>,
    pub is_starred: bool,
    pub origin: Option<Origin>,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
    #[ts(type = "number | null")]
    pub deleted_at: Option<i64>,
    pub tags: Vec<Tag>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
#[serde(default)]
#[derive(Default)]
pub struct PromptInput {
    pub title: String,
    pub body: String,
    pub system_prompt: Option<String>,
    pub category: String,
    pub target_model: Option<String>,
    pub tags: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PromptUpdateInput {
    pub id: String,
    #[serde(flatten)]
    pub data: PromptInput,
}
