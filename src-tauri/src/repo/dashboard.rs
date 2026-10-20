use crate::{
    domain::{common::ListQuery, dashboard::Dashboard},
    error::AppResult,
};
use rusqlite::{Connection, params};
fn recent<T>(
    conn: &Connection,
    kind: crate::domain::common::EntityType,
    cutoff: i64,
    get: impl Fn(&Connection, &str) -> AppResult<T>,
) -> AppResult<Vec<T>> {
    let extra = if kind == crate::domain::common::EntityType::Prompt {
        " AND is_system_template=0"
    } else {
        ""
    };
    let mut statement=conn.prepare(&format!("SELECT id FROM {} WHERE deleted_at IS NULL AND created_at>=?{extra} ORDER BY created_at DESC,id DESC LIMIT 3",kind.table()))?;
    let ids = statement
        .query_map(params![cutoff], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    ids.iter().map(|id| get(conn, id)).collect()
}
/// Build today's dashboard using explicit local dates and timestamps.
pub fn get(conn: &Connection, today: &str, start: i64, end: i64) -> AppResult<Dashboard> {
    let cutoff = start - 7 * 86400000;
    Ok(Dashboard {
        today: today.into(),
        todos: super::todos::list(
            conn,
            &ListQuery {
                view: Some("today".into()),
                limit: Some(200),
                ..Default::default()
            },
            today,
            start,
            end,
        )?
        .items,
        ideas: super::ideas::list(
            conn,
            &ListQuery {
                date_from: Some(today.into()),
                date_to: Some(today.into()),
                limit: Some(200),
                ..Default::default()
            },
            today,
            start,
            end,
        )?
        .items,
        recent_tips: recent(
            conn,
            crate::domain::common::EntityType::Tip,
            cutoff,
            super::tips::get,
        )?,
        recent_skills: recent(
            conn,
            crate::domain::common::EntityType::Skill,
            cutoff,
            super::skills::get,
        )?,
        recent_prompts: recent(
            conn,
            crate::domain::common::EntityType::Prompt,
            cutoff,
            super::prompts::get,
        )?,
    })
}
