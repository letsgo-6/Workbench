use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ParsedSkill {
    pub name: Option<String>,
    pub description: Option<String>,
    pub has_frontmatter: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ReadSkill {
    pub content: String,
    pub parsed: ParsedSkill,
}
