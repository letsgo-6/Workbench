use super::dates;
use crate::{
    domain::{capture::*, common::EntityType},
    error::{AppError, AppResult, ErrorCode},
    services::{ai::parse, skill_parse},
};
use chrono::{Duration, Local, Months, NaiveDate, NaiveDateTime, NaiveTime, TimeZone};
use regex::Regex;
use serde_json::Value;
use std::collections::HashSet;

pub struct Context<'a> {
    pub original: &'a str,
    pub forced: Option<EntityType>,
    pub target: Option<EntityType>,
    pub now: NaiveDateTime,
    pub existing_tags: &'a [String],
    pub known_tools: &'a [String],
}
fn field<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}
fn strings(v: &Value, key: &str) -> Vec<String> {
    v.get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect()
}
fn canonical(
    values: Vec<String>,
    known: &[String],
    only_known: bool,
    max: usize,
    count: usize,
) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    for value in values {
        let value = value.trim();
        if value.is_empty() || value.chars().count() > max {
            continue;
        }
        let matched = known
            .iter()
            .find(|s| s.to_lowercase() == value.to_lowercase());
        if only_known && matched.is_none() {
            continue;
        }
        let name = matched.map(String::as_str).unwrap_or(value);
        if !out.iter().any(|s| s.to_lowercase() == name.to_lowercase()) {
            out.push(name.into());
        }
        if out.len() == count {
            break;
        }
    }
    out
}

// Keep original byte ranges so whitespace-tolerant matching never stores rewritten AI text.
fn squash(text: &str) -> (String, Vec<(usize, usize)>) {
    let mut output = String::new();
    let mut spans: Vec<(usize, usize)> = vec![];
    for (start, c) in text.char_indices() {
        let end = start + c.len_utf8();
        if c.is_whitespace() && output.ends_with(' ') {
            if let Some(last) = spans.last_mut() {
                last.1 = end;
            }
        } else {
            output.push(if c.is_whitespace() { ' ' } else { c });
            spans.push((start, end));
        }
    }
    (output, spans)
}
fn source_range(original: &str, source: &str) -> Option<(usize, usize)> {
    let (haystack, spans) = squash(original);
    let needle = squash(source).0.trim().to_string();
    if needle.is_empty() {
        return None;
    }
    let offset = haystack.find(&needle)?;
    let first = haystack[..offset].chars().count();
    let last = first + needle.chars().count() - 1;
    Some((spans.get(first)?.0, spans.get(last)?.1))
}
fn urls(text: &str) -> AppResult<Vec<String>> {
    let pattern = Regex::new(r#"https?://[^\s<>"'，。；、）)】]+"#)
        .map_err(|_| AppError::coded(ErrorCode::Internal, "Invalid capture URL pattern"))?;
    Ok(pattern
        .find_iter(text)
        .map(|m| m.as_str().to_string())
        .collect())
}

/// Validate model suggestions while retaining all source text in its original spelling.
pub fn build_preview(raw: &str, ctx: &Context<'_>, truncated: bool) -> AppResult<CapturePreview> {
    let value = parse::json(raw)
        .ok_or_else(|| AppError::coded(ErrorCode::AiBadResponse, "Invalid capture JSON"))?;
    let items = value
        .get("items")
        .and_then(Value::as_array)
        .filter(|a| !a.is_empty())
        .ok_or_else(|| AppError::coded(ErrorCode::AiBadResponse, "Missing capture items"))?;
    let prefix_only = ctx.target.is_none() && ctx.forced.is_some();
    let single = prefix_only || items.len() == 1;
    let original_urls = urls(ctx.original)?;
    let mut covered = HashSet::new();
    let mut normalized = vec![];
    for raw in items.iter().take(if prefix_only { 1 } else { 10 }) {
        let parsed_kind = EntityType::ALL
            .into_iter()
            .find(|k| k.table() == field(raw, "type"));
        let kind = ctx
            .target
            .or(ctx.forced)
            .or(parsed_kind)
            .unwrap_or(EntityType::Idea);
        let confidence = if prefix_only
            || ((ctx.target.is_some() || parsed_kind.is_some())
                && field(raw, "confidence") == "high")
        {
            Confidence::High
        } else {
            Confidence::Low
        };
        let mut warnings = vec![];
        let range = if single {
            Some((0, ctx.original.len()))
        } else {
            source_range(ctx.original, field(raw, "source"))
        };
        let source = if let Some((start, end)) = range {
            covered.extend(
                ctx.original[start..end]
                    .char_indices()
                    .filter(|(_, c)| !c.is_whitespace())
                    .map(|(i, _)| start + i),
            );
            ctx.original[start..end].to_string()
        } else {
            warnings.push(CaptureWarning::SourceMismatch);
            ctx.original.to_string()
        };
        if confidence == Confidence::Low {
            warnings.push(CaptureWarning::LowConfidence);
        }
        let mut item = CaptureItem {
            kind,
            source: source.clone(),
            title: field(raw, "title").trim().into(),
            body: source.clone(),
            skill_content: None,
            date: None,
            due_date: None,
            remind_at: None,
            date_text: None,
            date_source: None,
            priority: raw
                .get("priority")
                .and_then(Value::as_i64)
                .filter(|n| (1..=3).contains(n))
                .unwrap_or(2) as i32,
            tools: if kind == EntityType::Tip {
                canonical(strings(raw, "tools"), ctx.known_tools, true, 200, 100)
            } else {
                vec![]
            },
            url: None,
            description: field(raw, "description").chars().take(100).collect(),
            category: field(raw, "category").into(),
            material_kind: if kind == EntityType::Material {
                Some(
                    if field(raw, "materialKind") == "component"
                        || ctx.forced == Some(EntityType::Material)
                            && ctx.original.starts_with("组件")
                    {
                        "component"
                    } else {
                        "work"
                    }
                    .into(),
                )
            } else {
                None
            },
            material_prompt: if kind == EntityType::Material
                && !field(raw, "prompt").trim().is_empty()
                && source.contains(field(raw, "prompt"))
            {
                field(raw, "prompt").into()
            } else {
                String::new()
            },
            tags: canonical(strings(raw, "tags"), ctx.existing_tags, false, 30, 5),
            confidence,
            warnings,
        };
        let url = field(raw, "url");
        if !url.is_empty() {
            if original_urls.iter().any(|s| s == url) {
                item.url = Some(url.into());
            } else {
                item.warnings.push(CaptureWarning::UrlDropped);
            }
        } else if matches!(
            kind,
            EntityType::Tip | EntityType::Skill | EntityType::Material
        ) {
            let found = urls(&source)?;
            if found.len() == 1 {
                item.url = found.into_iter().next();
            }
        }
        apply_date(&mut item, raw, ctx);
        match kind {
            EntityType::Material => {}
            EntityType::Idea => item.title.clear(),
            EntityType::Todo => {
                if item.title.is_empty() {
                    item.title = source.lines().next().unwrap_or("").into();
                }
                if let Some(phrase) = &item.date_text {
                    item.title = item.title.replace(phrase, "");
                }
                item.title = item
                    .title
                    .trim_matches(|c: char| {
                        c.is_whitespace()
                            || c.is_ascii_punctuation()
                            || "，。；：、！？“”‘’（）【】".contains(c)
                    })
                    .into();
                if squash(&source).0.trim() == squash(&item.title).0.trim() {
                    item.body.clear();
                }
            }
            EntityType::Tip => {
                if item.title.is_empty() {
                    item.title = source.lines().next().unwrap_or("").into();
                }
            }
            EntityType::Skill => {
                if let Ok(parsed) = skill_parse::parse(&source)
                    && parsed.has_frontmatter
                {
                    item.skill_content = Some(source.clone());
                    if item.title.is_empty() {
                        item.title = parsed.name.unwrap_or_default();
                    }
                    if item.description.is_empty() {
                        item.description = parsed
                            .description
                            .unwrap_or_default()
                            .chars()
                            .take(100)
                            .collect();
                    }
                }
            }
            EntityType::Prompt => {
                let body = field(raw, "body");
                if !body.trim().is_empty() && source.contains(body) {
                    item.body = body.into();
                }
            }
        }
        let max = if kind == EntityType::Todo { 500 } else { 200 };
        if item.title.chars().count() > max {
            item.title = item.title.chars().take(max).collect();
            item.warnings.push(CaptureWarning::TitleTruncated);
        }
        normalized.push(item);
    }
    let total = ctx.original.chars().filter(|c| !c.is_whitespace()).count();
    let partial_coverage = !single && covered.len() * 100 < total * 60;
    let auto_save_eligible = !partial_coverage
        && !truncated
        && normalized.len() <= 5
        && normalized.iter().all(|i| {
            i.confidence == Confidence::High
                && (i.kind != EntityType::Todo || !i.title.trim().is_empty())
                && !(matches!(i.kind, EntityType::Skill | EntityType::Material)
                    && i.url.is_some()
                    && i.title.trim().is_empty())
                && i.warnings.iter().all(|w| {
                    matches!(
                        w,
                        CaptureWarning::TimeRolledOver | CaptureWarning::TitleTruncated
                    )
                })
        });
    Ok(CapturePreview {
        items: normalized,
        today: ctx.now.date().to_string(),
        partial_coverage,
        truncated,
        auto_save_eligible,
    })
}

fn apply_date(item: &mut CaptureItem, raw: &Value, ctx: &Context<'_>) {
    if !matches!(item.kind, EntityType::Idea | EntityType::Todo) {
        return;
    }
    let today = ctx.now.date();
    if item.kind == EntityType::Idea {
        item.date = Some(today.to_string());
    }
    let phrase = field(raw, "dateText");
    if phrase.trim().is_empty() || !item.source.contains(phrase) {
        return;
    }
    item.date_text = Some(phrase.into());
    let resolved = dates::resolve(phrase, ctx.now, item.kind == EntityType::Todo);
    let resolved = if let Some(r) = resolved {
        item.date_source = Some(DateSource::Rule);
        Some(r)
    } else {
        let date = field(raw, "date");
        let parsed = NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .ok()
            .filter(|_| date.len() == 10);
        let lower = today.checked_sub_months(Months::new(12));
        let upper = today.checked_add_months(Months::new(36));
        if let Some(date) =
            parsed.filter(|d| lower.is_some_and(|l| *d >= l) && upper.is_some_and(|u| *d <= u))
        {
            item.date_source = Some(DateSource::Ai);
            item.warnings.push(CaptureWarning::DateFromAi);
            Some(dates::Resolved {
                date: Some(date),
                time: NaiveTime::parse_from_str(field(raw, "time"), "%H:%M")
                    .ok()
                    .filter(|_| field(raw, "time").len() == 5),
            })
        } else {
            item.warnings.push(CaptureWarning::DateUnresolved);
            None
        }
    };
    let Some(mut resolved) = resolved else {
        return;
    };
    if item.kind == EntityType::Todo {
        if resolved.date.is_none()
            && let Some(time) = resolved.time
        {
            let tomorrow = time < ctx.now.time();
            resolved.date = today.checked_add_signed(Duration::days(i64::from(tomorrow)));
            if tomorrow {
                item.warnings.push(CaptureWarning::TimeRolledOver);
            }
        }
        item.due_date = resolved.date.map(|d| d.to_string());
        item.remind_at = resolved
            .date
            .zip(resolved.time)
            .and_then(|(d, t)| Local.from_local_datetime(&d.and_time(t)).earliest())
            .map(|d| d.timestamp_millis());
        if resolved.date.is_some_and(|d| d < today) {
            item.warnings.push(CaptureWarning::DatePast);
        }
    } else if let Some(date) = resolved
        .date
        .filter(|d| *d <= today && today.signed_duration_since(*d).num_days() <= 30)
    {
        item.date = Some(date.to_string());
    }
}

#[cfg(test)]
mod tests;
