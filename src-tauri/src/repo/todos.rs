use crate::{
    domain::{common::*, todo::*},
    error::{AppError, AppResult},
};
use rusqlite::{
    Connection, OptionalExtension, Transaction, params, params_from_iter, types::Value,
};
const PROJECTION: &str = "todo.*, (SELECT count(*) FROM todo child WHERE child.parent_id=todo.id AND child.deleted_at IS NULL) AS subtask_total, (SELECT count(*) FROM todo child WHERE child.parent_id=todo.id AND child.deleted_at IS NULL AND child.status='done') AS subtask_done";
fn map(row: &rusqlite::Row<'_>) -> rusqlite::Result<Todo> {
    Ok(Todo {
        id: row.get("id")?,
        title: row.get("title")?,
        note_md: row.get("note_md")?,
        due_date: row.get("due_date")?,
        priority: row.get("priority")?,
        sort_order: row.get("sort_order")?,
        status: row.get("status")?,
        completed_at: row.get("completed_at")?,
        parent_id: row.get("parent_id")?,
        remind_at: row.get("remind_at")?,
        reminded_at: row.get("reminded_at")?,
        subtask_total: row.get("subtask_total")?,
        subtask_done: row.get("subtask_done")?,
        is_starred: row.get("is_starred")?,
        origin: super::common::origin(row)?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
        tags: vec![],
    })
}
/// Load a live entity with its tags.
pub fn get(conn: &Connection, id: &str) -> AppResult<Todo> {
    let mut item = conn
        .query_row(
            &format!("SELECT {PROJECTION} FROM todo WHERE id=? AND deleted_at IS NULL"),
            [id],
            map,
        )
        .optional()?
        .ok_or(AppError::NotFound)?;
    item.tags = super::common::load_tags_for(conn, EntityType::Todo, &[id.into()])?
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
) -> AppResult<Page<Todo>> {
    let (filter, mut args, order) =
        super::common::filters(EntityType::Todo, query, today, start, end)?;
    let total = conn.query_row(
        &format!("SELECT count(*) FROM todo WHERE {filter}"),
        params_from_iter(args.clone()),
        |r| r.get(0),
    )?;
    args.extend([
        Value::Integer(i64::from(query.limit.unwrap_or(50).clamp(1, 200))),
        Value::Integer(i64::from(query.offset)),
    ]);
    let mut stmt = conn.prepare(&format!(
        "SELECT {PROJECTION} FROM todo WHERE {filter} ORDER BY {order} LIMIT ? OFFSET ?"
    ))?;
    let mut items = stmt
        .query_map(params_from_iter(args), map)?
        .collect::<Result<Vec<_>, _>>()?;
    let ids = items.iter().map(|e| e.id.clone()).collect::<Vec<_>>();
    let mut tags = super::common::load_tags_for(conn, EntityType::Todo, &ids)?;
    for item in &mut items {
        item.tags = tags.remove(&item.id).unwrap_or_default();
    }
    Ok(Page { items, total })
}
/// Create content and search projection atomically.
pub fn create(
    tx: &Transaction<'_>,
    input: &TodoInput,
    now: i64,
    origin: Option<&Origin>,
) -> AppResult<Todo> {
    let id = uuid::Uuid::now_v7().to_string();
    validate_parent(tx, &id, input.parent_id.as_deref())?;
    tx.execute("INSERT INTO todo(id,title,note_md,due_date,priority,sort_order,parent_id,remind_at,origin_type,origin_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",params![id,input.title,input.note_md,input.due_date,input.priority,input.sort_order,input.parent_id,input.remind_at,origin.map(|o|o.entity_type.table()),origin.map(|o|&o.id),now,now])?;
    let r = EntityRef {
        entity_type: EntityType::Todo,
        id: id.clone(),
    };
    super::common::set_tags(tx, &r, &input.tags, now)?;
    super::search::upsert(tx, &r)?;
    get(tx, &id)
}
/// Replace editable fields, retaining metadata and completion state.
pub fn update(tx: &Transaction<'_>, id: &str, input: &TodoInput, now: i64) -> AppResult<Todo> {
    let old = get(tx, id)?;
    if old.parent_id != input.parent_id {
        return Err(AppError::Invalid("Cannot move a subtask".into()));
    }
    validate_parent(tx, id, input.parent_id.as_deref())?;
    let reminded = if old.remind_at == input.remind_at && old.due_date == input.due_date {
        old.reminded_at
    } else {
        None
    };
    tx.execute("UPDATE todo SET title=?,note_md=?,due_date=?,priority=?,sort_order=?,remind_at=?,reminded_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL",params![input.title,input.note_md,input.due_date,input.priority,input.sort_order,input.remind_at,reminded,now,id])?;
    let r = EntityRef {
        entity_type: EntityType::Todo,
        id: id.into(),
    };
    super::common::set_tags(tx, &r, &input.tags, now)?;
    super::search::upsert(tx, &r)?;
    get(tx, id)
}

fn validate_parent(conn: &Connection, id: &str, parent: Option<&str>) -> AppResult<()> {
    if let Some(parent) = parent
        && (parent == id || get(conn, parent)?.parent_id.is_some())
    {
        return Err(AppError::Invalid(
            "Only one subtask level is supported".into(),
        ));
    }
    Ok(())
}
/// Read a parent's live subtasks in stable order.
pub fn children(conn: &Connection, id: &str) -> AppResult<Vec<Todo>> {
    get(conn, id)?;
    let mut stmt = conn.prepare("SELECT id FROM todo WHERE parent_id=? AND deleted_at IS NULL ORDER BY sort_order,created_at,id")?;
    let ids = stmt
        .query_map([id], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    ids.iter().map(|id| get(conn, id)).collect()
}
