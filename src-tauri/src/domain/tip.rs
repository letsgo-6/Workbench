use super::common::{Origin, Tag};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
/// Canonical built-in Agent tools, mirrored by src/lib/tools.ts.
pub const PRESET_TOOLS: [&str; 4] = ["Claude Code", "Cursor", "ChatGPT", "Codex"];
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Tip {
    pub id: String,
    pub title: String,
    pub content_md: String,
    pub tools: Vec<String>,
    pub source_url: Option<String>,
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
pub struct TipInput {
    pub title: String,
    pub content_md: String,
    pub tools: Vec<String>,
    pub source_url: Option<String>,
    pub tags: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TipUpdateInput {
    pub id: String,
    #[serde(flatten)]
    pub data: TipInput,
}
