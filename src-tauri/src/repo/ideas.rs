use crate::{
    domain::{common::*, idea::*},
    error::{AppError, AppResult},
};
use rusqlite::{
    Connection, OptionalExtension, Transaction, params, params_from_iter, types::Value,
};
fn map(row: &rusqlite::Row<'_>) -> rusqlite::Result<Idea> {
    Ok(Idea {
        id: row.get("id")?,
        content_md: row.get("content_md")?,
        date: row.get("date")?,
        is_starred: row.get("is_starred")?,
        origin: super::common::origin(row)?,
        converted: vec![],
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
        tags: vec![],
    })
}
/// Load a live entity with its tags.
pub fn get(conn: &Connection, id: &str) -> AppResult<Idea> {
    let mut item = conn
        .query_row(
            "SELECT * FROM idea WHERE id=? AND deleted_at IS NULL",
            [id],
            map,
        )
        .optional()?
        .ok_or(AppError::NotFound)?;
    item.tags = super::common::load_tags_for(conn, EntityType::Idea, &[id.into()])?
        .remove(id)
        .unwrap_or_default();
    for kind in [EntityType::Todo, EntityType::Tip, EntityType::Prompt] {
        let mut stmt = conn.prepare(&format!("SELECT id FROM {} WHERE origin_type='idea' AND origin_id=? AND deleted_at IS NULL ORDER BY created_at", kind.table()))?;
        item.converted.extend(
            stmt.query_map([id], |row| {
                Ok(EntityRef {
                    entity_type: kind,
                    id: row.get(0)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?,
        );
    }
    Ok(item)
}
/// Return one deterministic page, batch-loading tag relations.
pub fn list(
    conn: &Connection,
    query: &ListQuery,
    today: &str,
    start: i64,
    end: i64,
) -> AppResult<Page<Idea>> {
    let (filter, mut args, order) =
        super::common::filters(EntityType::Idea, query, today, start, end)?;
    let total = conn.query_row(
        &format!("SELECT count(*) FROM idea WHERE {filter}"),
        params_from_iter(args.clone()),
        |r| r.get(0),
    )?;
    args.extend([
        Value::Integer(i64::from(query.limit.unwrap_or(50).clamp(1, 200))),
        Value::Integer(i64::from(query.offset)),
    ]);
    let mut stmt = conn.prepare(&format!(
        "SELECT * FROM idea WHERE {filter} ORDER BY {order} LIMIT ? OFFSET ?"
    ))?;
    let mut items = stmt
        .query_map(params_from_iter(args), map)?
        .collect::<Result<Vec<_>, _>>()?;
    let ids = items.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
    let mut tags = super::common::load_tags_for(conn, EntityType::Idea, &ids)?;
    for item in &mut items {
        item.tags = tags.remove(&item.id).unwrap_or_default();
    }
    Ok(Page { items, total })
}
/// Create content and search projection atomically.
pub fn create(
    tx: &Transaction<'_>,
    input: &IdeaInput,
    now: i64,
    origin: Option<&Origin>,
) -> AppResult<Idea> {
    let id = uuid::Uuid::now_v7().to_string();
    tx.execute("INSERT INTO idea(id,content_md,date,origin_type,origin_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",params![id,input.content_md,input.date,origin.map(|o|o.entity_type.table()),origin.map(|o|&o.id),now,now])?;
    let r = EntityRef {
        entity_type: EntityType::Idea,
        id: id.clone(),
    };
    super::common::set_tags(tx, &r, &input.tags, now)?;
    super::search::upsert(tx, &r)?;
    get(tx, &id)
}
/// Replace editable fields, retaining metadata and completion state.
pub fn update(tx: &Transaction<'_>, id: &str, input: &IdeaInput, now: i64) -> AppResult<Idea> {
    get(tx, id)?;
    tx.execute(
        "UPDATE idea SET content_md=?,date=?,updated_at=? WHERE id=? AND deleted_at IS NULL",
        params![input.content_md, input.date, now, id],
    )?;
    let r = EntityRef {
        entity_type: EntityType::Idea,
        id: id.into(),
    };
    super::common::set_tags(tx, &r, &input.tags, now)?;
    super::search::upsert(tx, &r)?;
    get(tx, id)
}
/// Count live ideas per day in a validated local calendar month.
pub fn calendar(
    conn: &rusqlite::Connection,
    month: &str,
) -> crate::error::AppResult<Vec<crate::domain::calendar::CalendarDay>> {
    let date = chrono::NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d")
        .map_err(|_| crate::error::AppError::Invalid("Month must be YYYY-MM".into()))?;
    if month.len() != 7 {
        return Err(crate::error::AppError::Invalid(
            "Month must be YYYY-MM".into(),
        ));
    }
    let next = date
        .checked_add_months(chrono::Months::new(1))
        .ok_or_else(|| crate::error::AppError::Invalid("Invalid month".into()))?;
    Ok(conn.prepare("SELECT date,count(*) FROM idea WHERE deleted_at IS NULL AND date>=? AND date<? GROUP BY date ORDER BY date")?.query_map(rusqlite::params![date.to_string(),next.to_string()],|r|Ok(crate::domain::calendar::CalendarDay {date:r.get(0)?,count:r.get(1)?}))?.collect::<Result<Vec<_>,_>>()?)
}
