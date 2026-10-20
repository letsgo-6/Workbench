use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SkillCandidate {
    pub path: String,
    pub name: String,
    pub description: String,
    pub exists: bool,
    pub error: Option<String>,
}
#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SkillBatchReport {
    pub inserted: u32,
    pub skipped: u32,
}
