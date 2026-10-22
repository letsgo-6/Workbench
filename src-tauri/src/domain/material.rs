use super::common::{Origin, Tag};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Material {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub url: Option<String>,
    pub note_md: String,
    pub prompt: String,
    pub cover_asset_id: Option<String>,
    pub assets: Vec<MaterialAsset>,
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
pub struct MaterialAsset {
    pub id: String,
    pub media_kind: String,
    pub mime: String,
    pub original_name: String,
    #[ts(type = "number")]
    pub size_bytes: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_ms: Option<u32>,
    pub path: String,
    pub thumb_path: Option<String>,
    pub missing: bool,
}
#[derive(Debug, Default, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export)]
pub struct MaterialInput {
    pub kind: String,
    pub title: String,
    pub url: Option<String>,
    pub note_md: String,
    pub prompt: String,
    pub cover_asset_id: Option<String>,
    pub tags: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MaterialUpdateInput {
    pub id: String,
    #[serde(flatten)]
    pub data: MaterialInput,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MaterialImportInput {
    pub material_id: Option<String>,
    pub kind: Option<String>,
    pub paths: Vec<String>,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MaterialImportResult {
    pub material: Material,
    pub materials: Vec<Material>,
    pub added: u32,
    pub skipped: u32,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AssetOrderInput {
    pub material_id: String,
    pub ids: Vec<String>,
}
#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MaterialCoverInput {
    pub material_id: String,
    pub asset_id: String,
}
#[derive(Debug, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AssetsUsage {
    pub file_count: u32,
    #[ts(type = "number")]
    pub total_bytes: u64,
    #[ts(type = "number")]
    pub purged_bytes: u64,
}
