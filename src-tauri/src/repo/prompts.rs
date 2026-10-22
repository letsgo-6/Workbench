use crate::{
    domain::{common::*, prompt::*},
    error::{AppError, AppResult},
};
use rusqlite::{
    Connection, OptionalExtension, Transaction, params, params_from_iter, types::Value,
};
fn map(row: &rusqlite::Row<'_>) -> rusqlite::Result<Prompt> {
    Ok(Prompt {
        id: row.get("id")?,
        title: row.get("title")?,
        body: row.get("body")?,
        system_prompt: row.get("system_prompt")?,
        category: row.get("category")?,
        target_model: row.get("target_model")?,
        variables: serde_json::from_str(&row.get::<_, String>("variables")?).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        })?,
        use_count: row.get("use_count")?,
        is_system_template: row.get("is_system_template")?,
        template_key: row.get("template_key")?,
        has_new_default: None,
        is_starred: row.get("is_starred")?,
        origin: super::common::origin(row)?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
        tags: vec![],
    })
}
/// Load a live entity with its tags.
pub fn get(conn: &Connection, id: &str) -> AppResult<Prompt> {
    let mut item = conn
        .query_row(
            "SELECT * FROM prompt WHERE id=? AND deleted_at IS NULL",
            [id],
            map,
        )
        .optional()?
        .ok_or(AppError::NotFound)?;
    item.tags = super::common::load_tags_for(conn, EntityType::Prompt, &[id.into()])?
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
) -> AppResult<Page<Prompt>> {
    let (filter, mut args, order) =
        super::common::filters(EntityType::Prompt, query, today, start, end)?;
    let total = conn.query_row(
        &format!("SELECT count(*) FROM prompt WHERE {filter}"),
        params_from_iter(args.clone()),
        |r| r.get(0),
    )?;
    args.extend([
        Value::Integer(i64::from(query.limit.unwrap_or(50).clamp(1, 200))),
        Value::Integer(i64::from(query.offset)),
    ]);
    let mut stmt = conn.prepare(&format!(
        "SELECT * FROM prompt WHERE {filter} ORDER BY {order} LIMIT ? OFFSET ?"
    ))?;
    let mut items = stmt
        .query_map(params_from_iter(args), map)?
        .collect::<Result<Vec<_>, _>>()?;
    let ids = items.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
    let mut tags = super::common::load_tags_for(conn, EntityType::Prompt, &ids)?;
    for item in &mut items {
        item.tags = tags.remove(&item.id).unwrap_or_default();
    }
    Ok(Page { items, total })
}
/// Create content and search projection atomically.
pub fn create(
    tx: &Transaction<'_>,
    input: &PromptInput,
    now: i64,
    origin: Option<&Origin>,
) -> AppResult<Prompt> {
    let id = uuid::Uuid::now_v7().to_string();
    tx.execute("INSERT INTO prompt(id,title,body,system_prompt,category,target_model,variables,origin_type,origin_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",params![id,input.title,input.body,input.system_prompt,input.category,input.target_model,serde_json::to_string(&crate::services::template::variables(&input.body))?,origin.map(|o|o.entity_type.table()),origin.map(|o|&o.id),now,now])?;
    let r = EntityRef {
        entity_type: EntityType::Prompt,
        id: id.clone(),
    };
    super::common::set_tags(tx, &r, &input.tags, now)?;
    super::search::upsert(tx, &r)?;
    get(tx, &id)
}
/// Replace editable fields, retaining metadata and completion state.
pub fn update(tx: &Transaction<'_>, id: &str, input: &PromptInput, now: i64) -> AppResult<Prompt> {
    get(tx, id)?;
    tx.execute("UPDATE prompt SET title=?,body=?,system_prompt=?,category=?,target_model=?,variables=?,updated_at=? WHERE id=? AND deleted_at IS NULL",params![input.title,input.body,input.system_prompt,input.category,input.target_model,serde_json::to_string(&crate::services::template::variables(&input.body))?,now,id])?;
    let r = EntityRef {
        entity_type: EntityType::Prompt,
        id: id.into(),
    };
    super::common::set_tags(tx, &r, &input.tags, now)?;
    super::search::upsert(tx, &r)?;
    get(tx, id)
}
