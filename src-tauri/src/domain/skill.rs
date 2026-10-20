use super::common::{Origin, Tag};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source_type: String,
    pub content_md: Option<String>,
    pub url: Option<String>,
    pub platforms: Vec<String>,
    pub rating: Option<i32>,
    pub note: String,
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
pub struct SkillInput {
    pub name: String,
    pub description: String,
    pub source_type: String,
    pub content_md: Option<String>,
    pub url: Option<String>,
    pub platforms: Vec<String>,
    pub rating: Option<i32>,
    pub note: String,
    pub tags: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SkillUpdateInput {
    pub id: String,
    #[serde(flatten)]
    pub data: SkillInput,
}
