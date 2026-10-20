use crate::{
    domain::{common::*, tip::*},
    error::{AppError, AppResult},
};
use rusqlite::{
    Connection, OptionalExtension, Transaction, params, params_from_iter, types::Value,
};
fn map(row: &rusqlite::Row<'_>) -> rusqlite::Result<Tip> {
    Ok(Tip {
        id: row.get("id")?,
        title: row.get("title")?,
        content_md: row.get("content_md")?,
        tools: serde_json::from_str(&row.get::<_, String>("tools")?).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        })?,
        source_url: row.get("source_url")?,
        is_starred: row.get("is_starred")?,
        origin: super::common::origin(row)?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
        tags: vec![],
    })
}
/// Load a live entity with its tags.
pub fn get(conn: &Connection, id: &str) -> AppResult<Tip> {
    let mut item = conn
        .query_row(
            "SELECT * FROM tip WHERE id=? AND deleted_at IS NULL",
            [id],
            map,
        )
        .optional()?
        .ok_or(AppError::NotFound)?;
    item.tags = super::common::load_tags_for(conn, EntityType::Tip, &[id.into()])?
        .remove(id)
        .unwrap_or_default();
    Ok(item)
}
/// Return one deterministic page, batch-loading tag relations.
pub fn list(
    conn: &Connection,
    query: &ListQuery,
    today: &str,
    start: i64,
    end: i64,
) -> AppResult<Page<Tip>> {
    let (filter, mut args, order) =
        super::common::filters(EntityType::Tip, query, today, start, end)?;
    let total = conn.query_row(
        &format!("SELECT count(*) FROM tip WHERE {filter}"),
        params_from_iter(args.clone()),
        |r| r.get(0),
    )?;
    args.extend([
        Value::Integer(i64::from(query.limit.unwrap_or(50).clamp(1, 200))),
        Value::Integer(i64::from(query.offset)),
    ]);
    let mut stmt = conn.prepare(&format!(
        "SELECT * FROM tip WHERE {filter} ORDER BY {order} LIMIT ? OFFSET ?"
    ))?;
    let mut items = stmt
        .query_map(params_from_iter(args), map)?
        .collect::<Result<Vec<_>, _>>()?;
    let ids = items.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
    let mut tags = super::common::load_tags_for(conn, EntityType::Tip, &ids)?;
    for item in &mut items {
        item.tags = tags.remove(&item.id).unwrap_or_default();
    }
    Ok(Page { items, total })
}
/// Create content and search projection atomically.
pub fn create(
    tx: &Transaction<'_>,
    input: &TipInput,
    now: i64,
    origin: Option<&Origin>,
) -> AppResult<Tip> {
    let id = uuid::Uuid::now_v7().to_string();
    tx.execute("INSERT INTO tip(id,title,content_md,tools,source_url,origin_type,origin_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",params![id,input.title,input.content_md,serde_json::to_string(&input.tools)?,input.source_url,origin.map(|o|o.entity_type.table()),origin.map(|o|&o.id),now,now])?;
    let r = EntityRef {
        entity_type: EntityType::Tip,
        id: id.clone(),
    };
    super::common::set_tags(tx, &r, &input.tags, now)?;
    super::search::upsert(tx, &r)?;
    get(tx, &id)
}
/// Replace editable fields, retaining metadata and completion state.
pub fn update(tx: &Transaction<'_>, id: &str, input: &TipInput, now: i64) -> AppResult<Tip> {
    get(tx, id)?;
    tx.execute("UPDATE tip SET title=?,content_md=?,tools=?,source_url=?,updated_at=? WHERE id=? AND deleted_at IS NULL",params![input.title,input.content_md,serde_json::to_string(&input.tools)?,input.source_url,now,id])?;
    let r = EntityRef {
        entity_type: EntityType::Tip,
        id: id.into(),
    };
    super::common::set_tags(tx, &r, &input.tags, now)?;
    super::search::upsert(tx, &r)?;
    get(tx, id)
}
