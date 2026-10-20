use crate::{domain::common::SearchHit, error::AppResult, repo, state::AppState};
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchInput {
    pub q: String,
    pub limit_per_type: Option<u32>,
}
/// Query across all five content domains.
#[tauri::command(async)]
pub fn search_query(
    state: tauri::State<'_, AppState>,
    input: SearchInput,
) -> AppResult<Vec<SearchHit>> {
    super::validate(&serde_json::Value::String(input.q.clone()))?;
    state
        .db
        .with_conn(|c| repo::search::query(c, &input.q, input.limit_per_type.unwrap_or(8)))
}
