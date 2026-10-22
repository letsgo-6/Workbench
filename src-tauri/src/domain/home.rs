use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HomeOverview {
    pub today: String,
    pub nodes: Vec<HomeNode>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HomeNode {
    pub id: String,
    pub count: u32,
    pub overdue: u32,
    pub recent7: u32,
    pub latest: Vec<HomeLatest>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HomeLatest {
    pub id: String,
    pub title: String,
    pub sub: Option<String>,
}
