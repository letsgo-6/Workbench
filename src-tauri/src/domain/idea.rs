use super::common::{EntityRef, Origin, Tag};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Idea {
    pub id: String,
    pub content_md: String,
    pub date: String,
    pub is_starred: bool,
    pub origin: Option<Origin>,
    pub converted: Vec<EntityRef>,
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
pub struct IdeaInput {
    pub content_md: String,
    pub date: String,
    pub tags: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct IdeaUpdateInput {
    pub id: String,
    #[serde(flatten)]
    pub data: IdeaInput,
}
