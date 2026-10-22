use crate::{domain::home::HomeOverview, error::AppResult, repo, state::AppState};

#[tauri::command(async)]
pub fn home_overview(state: tauri::State<'_, AppState>) -> AppResult<HomeOverview> {
    let (today, _, _) = super::local_day()?;
    let date = chrono::NaiveDate::parse_from_str(&today, "%Y-%m-%d")
        .map_err(|e| crate::error::AppError::Invalid(e.to_string()))?;
    let first = date - chrono::Duration::days(6);
    use chrono::TimeZone;
    let cutoff = chrono::Local
        .from_local_datetime(&first.and_hms_opt(0, 0, 0).unwrap())
        .earliest()
        .ok_or_else(|| crate::error::AppError::Invalid("Invalid local date".into()))?
        .timestamp_millis();
    state
        .db
        .with_conn(|c| repo::home::overview(c, &today, cutoff))
}
