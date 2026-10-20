use super::common::{Origin, Tag};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Todo {
    pub id: String,
    pub title: String,
    pub note_md: String,
    pub due_date: Option<String>,
    pub priority: i32,
    pub sort_order: f64,
    pub status: String,
    #[ts(type = "number | null")]
    pub completed_at: Option<i64>,
    pub parent_id: Option<String>,
    #[ts(type = "number | null")]
    pub remind_at: Option<i64>,
    #[ts(type = "number | null")]
    pub reminded_at: Option<i64>,
    pub subtask_total: u32,
    pub subtask_done: u32,
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
pub struct TodoInput {
    pub title: String,
    pub note_md: String,
    pub due_date: Option<String>,
    pub priority: i32,
    pub sort_order: f64,
    pub parent_id: Option<String>,
    #[ts(type = "number | null")]
    pub remind_at: Option<i64>,
    pub tags: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TodoUpdateInput {
    pub id: String,
    #[serde(flatten)]
    pub data: TodoInput,
}
