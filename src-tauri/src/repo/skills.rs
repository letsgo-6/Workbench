use crate::{
    domain::{common::*, skill::*},
    error::{AppError, AppResult},
};
use rusqlite::{
    Connection, OptionalExtension, Transaction, params, params_from_iter, types::Value,
};
fn map(row: &rusqlite::Row<'_>) -> rusqlite::Result<Skill> {
    Ok(Skill {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        source_type: row.get("source_type")?,
        content_md: row.get("content_md")?,
        url: row.get("url")?,
        platforms: serde_json::from_str(&row.get::<_, String>("platforms")?).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        })?,
        rating: row.get("rating")?,
        note: row.get("note")?,
        is_starred: row.get("is_starred")?,
        origin: super::common::origin(row)?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
        tags: vec![],
    })
}
/// Load a live entity with its tags.
pub fn get(conn: &Connection, id: &str) -> AppResult<Skill> {
    let mut item = conn
        .query_row(
            "SELECT * FROM skill WHERE id=? AND deleted_at IS NULL",
            [id],
            map,
        )
        .optional()?
        .ok_or(AppError::NotFound)?;
    item.tags = super::common::load_tags_for(conn, EntityType::Skill, &[id.into()])?
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
) -> AppResult<Page<Skill>> {
    let (filter, mut args, order) =
        super::common::filters(EntityType::Skill, query, today, start, end)?;
    let total = conn.query_row(
        &format!("SELECT count(*) FROM skill WHERE {filter}"),
        params_from_iter(args.clone()),
        |r| r.get(0),
    )?;
    args.extend([
        Value::Integer(i64::from(query.limit.unwrap_or(50).clamp(1, 200))),
        Value::Integer(i64::from(query.offset)),
    ]);
    let mut stmt = conn.prepare(&format!(
        "SELECT * FROM skill WHERE {filter} ORDER BY {order} LIMIT ? OFFSET ?"
    ))?;
    let mut items = stmt
        .query_map(params_from_iter(args), map)?
        .collect::<Result<Vec<_>, _>>()?;
    let ids = items.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
    let mut tags = super::common::load_tags_for(conn, EntityType::Skill, &ids)?;
    for item in &mut items {
        item.tags = tags.remove(&item.id).unwrap_or_default();
    }
    Ok(Page { items, total })
}
/// Create content and search projection atomically.
pub fn create(
    tx: &Transaction<'_>,
    input: &SkillInput,
    now: i64,
    origin: Option<&Origin>,
) -> AppResult<Skill> {
    let id = uuid::Uuid::now_v7().to_string();
    tx.execute("INSERT INTO skill(id,name,description,source_type,content_md,url,platforms,rating,note,origin_type,origin_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",params![id,input.name,input.description,input.source_type,input.content_md,input.url,serde_json::to_string(&input.platforms)?,input.rating,input.note,origin.map(|o|o.entity_type.table()),origin.map(|o|&o.id),now,now])?;
    let r = EntityRef {
        entity_type: EntityType::Skill,
        id: id.clone(),
    };
    super::common::set_tags(tx, &r, &input.tags, now)?;
    super::search::upsert(tx, &r)?;
    get(tx, &id)
}
/// Replace editable fields, retaining metadata and completion state.
pub fn update(tx: &Transaction<'_>, id: &str, input: &SkillInput, now: i64) -> AppResult<Skill> {
    get(tx, id)?;
    tx.execute("UPDATE skill SET name=?,description=?,source_type=?,content_md=?,url=?,platforms=?,rating=?,note=?,updated_at=? WHERE id=? AND deleted_at IS NULL",params![input.name,input.description,input.source_type,input.content_md,input.url,serde_json::to_string(&input.platforms)?,input.rating,input.note,now,id])?;
    let r = EntityRef {
        entity_type: EntityType::Skill,
        id: id.into(),
    };
    super::common::set_tags(tx, &r, &input.tags, now)?;
    super::search::upsert(tx, &r)?;
    get(tx, id)
}
