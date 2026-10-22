use super::common::{EntityRef, EntityType};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum DateSource {
    Rule,
    Ai,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Confidence {
    High,
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum CaptureWarning {
    SourceMismatch,
    UrlDropped,
    DateFromAi,
    DateUnresolved,
    DatePast,
    TimeRolledOver,
    TitleTruncated,
    LowConfidence,
}

/// Flat editable fields retain their values when the preview changes type.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CaptureItem {
    pub kind: EntityType,
    pub source: String,
    pub title: String,
    pub body: String,
    pub skill_content: Option<String>,
    pub date: Option<String>,
    pub due_date: Option<String>,
    #[ts(type = "number | null")]
    pub remind_at: Option<i64>,
    pub date_text: Option<String>,
    pub date_source: Option<DateSource>,
    pub priority: i32,
    pub tools: Vec<String>,
    pub url: Option<String>,
    pub description: String,
    pub category: String,
    #[serde(default)]
    pub material_kind: Option<String>,
    #[serde(default)]
    pub material_prompt: String,
    pub tags: Vec<String>,
    pub confidence: Confidence,
    pub warnings: Vec<CaptureWarning>,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CapturePreview {
    pub items: Vec<CaptureItem>,
    pub today: String,
    pub partial_coverage: bool,
    pub truncated: bool,
    pub auto_save_eligible: bool,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CaptureAnalyzeInput {
    pub request_id: String,
    pub provider_id: Option<String>,
    pub text: String,
    /// v0.5: the module chosen in the composer; `None` keeps prefix/AI classification.
    #[serde(default)]
    pub target: Option<EntityType>,
}
/// v0.5: coarse pipeline steps shown in the one-round process panel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum CaptureStage {
    Preparing,
    Requesting,
    Streaming,
    Normalizing,
    Ready,
}
/// v0.5: progress for `capture_analyze_stream`; the preview itself is the command's return value.
/// Text is forwarded only to the requesting window and is never persisted or logged.
#[derive(Debug, Serialize, TS)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum CaptureStreamEvent {
    Stage {
        stage: CaptureStage,
        model: Option<String>,
    },
    Delta {
        text: String,
    },
    Reasoning {
        text: String,
    },
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CaptureCommitInput {
    pub items: Vec<CaptureItem>,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CaptureCommitResult {
    pub refs: Vec<EntityRef>,
    #[ts(type = "number")]
    pub created_at: i64,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CaptureUndoInput {
    pub refs: Vec<EntityRef>,
    #[ts(type = "number")]
    pub created_at: i64,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CaptureUndoResult {
    pub removed: u32,
    pub skipped: u32,
}
