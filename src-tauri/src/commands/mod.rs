pub mod app;
pub mod dashboard;
pub mod data;
pub mod ideas;
pub mod prompts;
pub mod search;
pub mod settings;
pub mod skills;
pub mod tags;
pub mod tips;
pub mod todos;
pub mod trash;
use crate::{
    domain::{
        idea::IdeaInput, prompt::PromptInput, skill::SkillInput, tip::TipInput, todo::TodoInput,
    },
    error::{AppError, AppResult},
};
use chrono::{Local, TimeZone};

/// Current local date and midnight range, accounting for timezone transitions.
pub fn local_day() -> AppResult<(String, i64, i64)> {
    let date = Local::now().date_naive();
    let next = date
        .succ_opt()
        .ok_or_else(|| AppError::Invalid("Invalid day".into()))?;
    let midnight = |date: chrono::NaiveDate| {
        date.and_hms_opt(0, 0, 0)
            .and_then(|d| Local.from_local_datetime(&d).earliest())
            .map(|d| d.timestamp_millis())
            .ok_or_else(|| AppError::Invalid("Local midnight is ambiguous".into()))
    };
    Ok((date.to_string(), midnight(date)?, midnight(next)?))
}
/// Enforce one-MiB text, URL and date contracts before entering a transaction.
pub fn validate(value: &serde_json::Value) -> AppResult<()> {
    match value {
        serde_json::Value::String(s) if s.len() > 1048576 => {
            return Err(AppError::Invalid("Text exceeds 1 MiB".into()));
        }
        serde_json::Value::Array(a) => {
            if a.len() > 1000 {
                return Err(AppError::Invalid("Too many values".into()));
            }
            for v in a {
                validate(v)?;
            }
        }
        serde_json::Value::Object(map) => {
            for (key, v) in map {
                validate(v)?;
                if let Some(s) = v.as_str() {
                    if ["url", "sourceUrl"].contains(&key.as_str()) && !s.is_empty() {
                        let u =
                            reqwest::Url::parse(s).map_err(|e| AppError::Invalid(e.to_string()))?;
                        if !["http", "https"].contains(&u.scheme()) {
                            return Err(AppError::Invalid("URL must use http or https".into()));
                        }
                    }
                    if ["date", "dueDate"].contains(&key.as_str())
                        && (s.len() != 10
                            || chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_err())
                    {
                        return Err(AppError::Invalid("Date must be YYYY-MM-DD".into()));
                    }
                }
            }
        }
        _ => {}
    }
    Ok(())
}
/// Default new ideas to the local day.
pub fn prepare_idea(input: &mut IdeaInput) -> AppResult<()> {
    if input.date.is_empty() {
        input.date = Local::now().date_naive().to_string();
    }
    Ok(())
}
/// Validate required todo title and priority.
pub fn prepare_todo(input: &mut TodoInput) -> AppResult<()> {
    if input.title.trim().is_empty() || input.title.chars().count() > 500 {
        return Err(AppError::Invalid(
            "Todo title is required and must be at most 500 characters".into(),
        ));
    }
    if !(1..=3).contains(&input.priority) {
        return Err(AppError::Invalid("Invalid priority".into()));
    }
    Ok(())
}
/// Tips allow a blank draft.
pub fn prepare_tip(_input: &mut TipInput) -> AppResult<()> {
    Ok(())
}
/// Normalize Skill source type and fallback name.
pub fn prepare_skill(input: &mut SkillInput) -> AppResult<()> {
    let has_content = input.content_md.as_ref().is_some_and(|s| !s.is_empty());
    let has_url = input.url.as_ref().is_some_and(|s| !s.is_empty());
    input.source_type = match (has_content, has_url) {
        (true, true) => "both",
        (_, true) => "url",
        _ => "md",
    }
    .into();
    if input.name.trim().is_empty() && has_url {
        input.name = input
            .url
            .clone()
            .unwrap_or_default()
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .into();
    }
    if input.rating.is_some_and(|r| !(1..=5).contains(&r)) {
        return Err(AppError::Invalid("Rating must be 1-5".into()));
    }
    Ok(())
}
/// Prompts allow a blank draft; variables are derived by the repository.
pub fn prepare_prompt(_input: &mut PromptInput) -> AppResult<()> {
    Ok(())
}
pub mod ai;
pub mod backups;
pub mod desktop;
pub mod history;
pub mod providers;
