use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Content domain; table names always come from this closed enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum EntityType {
    Idea,
    Todo,
    Tip,
    Skill,
    Prompt,
    Material,
}
impl EntityType {
    /// SQLite table name for this domain.
    pub fn table(self) -> &'static str {
        match self {
            Self::Idea => "idea",
            Self::Todo => "todo",
            Self::Tip => "tip",
            Self::Skill => "skill",
            Self::Prompt => "prompt",
            Self::Material => "material",
        }
    }
    /// All searchable content domains.
    pub const ALL: [Self; 6] = [
        Self::Idea,
        Self::Todo,
        Self::Tip,
        Self::Skill,
        Self::Prompt,
        Self::Material,
    ];
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EntityRef {
    pub entity_type: EntityType,
    pub id: String,
}
pub type Origin = EntityRef;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub use_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Page<T> {
    pub items: Vec<T>,
    pub total: u32,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct ListQuery {
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub tag: Option<String>,
    pub starred_only: bool,
    pub view: Option<String>,
    pub tool: Option<String>,
    pub category: Option<String>,
    pub system_only: bool,
    pub material_kind: Option<String>,
    pub offset: u32,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct IdInput {
    pub id: String,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct StarInput {
    pub id: String,
    pub starred: bool,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BulkInput {
    pub refs: Vec<EntityRef>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TrashItem {
    pub r#ref: EntityRef,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub material_kind: Option<String>,
    #[ts(type = "number")]
    pub deleted_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SearchHit {
    pub entity_type: EntityType,
    pub id: String,
    pub title: String,
    pub snippet: String,
    #[ts(type = "number")]
    pub updated_at: i64,
}
