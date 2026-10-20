use crate::{
    domain::{ai::AiInput, common::EntityType},
    error::{AppError, AppResult},
    repo,
};
use rusqlite::Connection;
/// Resolve references on the backend and proportionally truncate by Unicode characters.
pub fn build(conn: &Connection, input: &AiInput, limit: usize) -> AppResult<(String, bool)> {
    let parts = match input {
        AiInput::Text { text } => {
            let truncated = text.chars().count() > limit;
            return Ok((
                if truncated {
                    format!(
                        "{}（部分内容已截断）",
                        text.chars()
                            .take(limit.saturating_sub(10))
                            .collect::<String>()
                    )
                } else {
                    text.clone()
                },
                truncated,
            ));
        }
        AiInput::Entities { refs } => {
            if refs.is_empty() || refs.len() > 200 {
                return Err(AppError::Invalid("Select 1–200 items".into()));
            }
            let mut parts = vec![];
            for (i, r) in refs.iter().enumerate() {
                let (body, date) = match r.entity_type {
                    EntityType::Idea => {
                        let e = repo::ideas::get(conn, &r.id)?;
                        (e.content_md, e.date)
                    }
                    EntityType::Todo => {
                        let e = repo::todos::get(conn, &r.id)?;
                        (
                            format!("{}\n{}", e.title, e.note_md),
                            e.due_date.unwrap_or_default(),
                        )
                    }
                    EntityType::Tip => {
                        let e = repo::tips::get(conn, &r.id)?;
                        (
                            format!("{}\n{}", e.title, e.content_md),
                            e.created_at.to_string(),
                        )
                    }
                    EntityType::Skill => {
                        let e = repo::skills::get(conn, &r.id)?;
                        (
                            format!(
                                "{}\n{}\n{}",
                                e.name,
                                e.description,
                                e.content_md.unwrap_or_default()
                            ),
                            e.created_at.to_string(),
                        )
                    }
                    EntityType::Prompt => {
                        let e = repo::prompts::get(conn, &r.id)?;
                        (format!("{}\n{}", e.title, e.body), e.created_at.to_string())
                    }
                };
                parts.push((
                    format!(
                        "### 条目 {}（{} · {}）\n",
                        i + 1,
                        r.entity_type.table(),
                        date
                    ),
                    body,
                ));
            }
            parts
        }
    };
    Ok(truncate(parts, limit))
}
fn truncate(parts: Vec<(String, String)>, limit: usize) -> (String, bool) {
    let headers = parts
        .iter()
        .map(|(h, _)| h.chars().count() + 2)
        .sum::<usize>();
    let total = parts.iter().map(|(_, b)| b.chars().count()).sum::<usize>();
    let truncated = headers + total > limit;
    let budget = limit.saturating_sub(headers + 20);
    let mut out = String::new();
    for (header, body) in parts {
        out.push_str(&header);
        let take = if truncated {
            (body.chars().count() * budget)
                .checked_div(total)
                .unwrap_or(0)
        } else {
            body.chars().count()
        };
        out.extend(body.chars().take(take));
        out.push_str("\n\n");
    }
    if truncated {
        if out.chars().count() > limit.saturating_sub(10) {
            out = out.chars().take(limit.saturating_sub(10)).collect();
        }
        out.push_str("（部分内容已截断）");
    }
    (out, truncated)
}
/// Resolve today's source directly from SQLite, including each task's completion state.
pub fn daily(conn: &Connection, today: &str, start: i64, end: i64) -> AppResult<String> {
    let ideas=conn.prepare("SELECT content_md FROM idea WHERE deleted_at IS NULL AND date=? ORDER BY created_at,id")?.query_map([today],|r|r.get::<_,String>(0))?.collect::<Result<Vec<_>,_>>()?;
    let todos=conn.prepare("SELECT title,status,note_md FROM todo WHERE deleted_at IS NULL AND parent_id IS NULL AND ((status='todo' AND due_date<=?) OR (status='done' AND completed_at>=? AND completed_at<?)) ORDER BY created_at,id")?.query_map(rusqlite::params![today,start,end],|r|Ok(format!("- [{}] {}\n{}",if r.get::<_,String>(1)?=="done" {"x"} else {" "},r.get::<_,String>(0)?,r.get::<_,String>(2)?)))?.collect::<Result<Vec<_>,_>>()?;
    Ok(format!(
        "## 今日灵感\n{}\n\n## 今日待办\n{}",
        ideas.join("\n\n"),
        todos.join("\n")
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn proportional_unicode() {
        let (s, t) = truncate(
            vec![
                ("a".into(), "中".repeat(1000)),
                ("b".into(), "文".repeat(3000)),
            ],
            200,
        );
        assert!(t && s.chars().count() <= 200);
        assert!(s.contains('中') && s.contains('文'));
    }
}
