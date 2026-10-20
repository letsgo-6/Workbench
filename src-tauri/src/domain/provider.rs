use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProviderView {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub temperature: f64,
    pub max_tokens: Option<u32>,
    pub is_default: bool,
    pub has_key: bool,
    pub key_hint: Option<String>,
}
#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProviderInput {
    pub id: Option<String>,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub temperature: f64,
    pub max_tokens: Option<u32>,
    pub api_key: Option<String>,
}
#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ProviderTestInput {
    pub provider_id: Option<String>,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
}
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConnectionTest {
    pub ok: bool,
    pub latency_ms: u32,
    pub error: Option<crate::error::AppErrorPayload>,
}
