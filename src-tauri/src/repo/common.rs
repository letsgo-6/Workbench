use crate::{
    domain::common::*,
    error::{AppError, AppResult},
};
use rusqlite::{Connection, Transaction, params, params_from_iter, types::Value};
use std::collections::HashMap;

/// Check batch timestamps and protect any subsequently attached task content.
pub fn capture_unchanged(conn: &Connection, r: &EntityRef, created_at: i64) -> AppResult<bool> {
    let child_guard = if r.entity_type == EntityType::Todo {
        " AND NOT EXISTS(SELECT 1 FROM todo child WHERE child.parent_id=todo.id)"
    } else if r.entity_type == EntityType::Material {
        " AND NOT EXISTS(SELECT 1 FROM material_asset child WHERE child.material_id=material.id)"
    } else {
        ""
    };
    Ok(conn.query_row(&format!("SELECT EXISTS(SELECT 1 FROM {} WHERE id=? AND deleted_at IS NULL AND created_at=? AND updated_at=?{child_guard})",r.entity_type.table()),params![r.id,created_at,created_at],|row|row.get(0))?)
}

/// Shared metadata mapping for typed entity rows.
pub fn origin(row: &rusqlite::Row<'_>) -> rusqlite::Result<Option<Origin>> {
    let kind: Option<String> = row.get("origin_type")?;
    let id: Option<String> = row.get("origin_id")?;
    Ok(kind.zip(id).and_then(|(kind, id)| {
        EntityType::ALL
            .into_iter()
            .find(|k| k.table() == kind)
            .map(|entity_type| Origin { entity_type, id })
    }))
}

/// Load all tags in one query for an entire page.
pub fn load_tags_for(
    conn: &Connection,
    kind: EntityType,
    ids: &[String],
) -> AppResult<HashMap<String, Vec<Tag>>> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let placeholders = vec!["?"; ids.len()].join(",");
    let mut values = vec![Value::Text(kind.table().into())];
    values.extend(ids.iter().cloned().map(Value::Text));
    let mut stmt = conn.prepare(&format!("SELECT et.entity_id,t.id,t.name,t.color FROM entity_tag et JOIN tag t ON t.id=et.tag_id WHERE et.entity_type=? AND et.entity_id IN ({placeholders}) ORDER BY t.name"))?;
    let rows = stmt.query_map(params_from_iter(values), |r| {
        Ok((
            r.get::<_, String>(0)?,
            Tag {
                id: r.get(1)?,
                name: r.get(2)?,
                color: r.get(3)?,
                use_count: 0,
            },
        ))
    })?;
    let mut result: HashMap<String, Vec<Tag>> = HashMap::new();
    for row in rows {
        let (id, tag) = row?;
        result.entry(id).or_default().push(tag);
    }
    Ok(result)
}

/// Replace name-based tag links within the entity's transaction.
pub fn set_tags(tx: &Transaction<'_>, r: &EntityRef, names: &[String], now: i64) -> AppResult<()> {
    tx.execute(
        "DELETE FROM entity_tag WHERE entity_type=? AND entity_id=?",
        params![r.entity_type.table(), r.id],
    )?;
    for name in names.iter().map(|n| n.trim()).filter(|n| !n.is_empty()) {
        if name.chars().count() > 100 {
            return Err(AppError::Invalid("Tag too long".into()));
        }
        tx.execute(
            "INSERT INTO tag(id,name,created_at) VALUES (?,?,?) ON CONFLICT(name) DO NOTHING",
            params![uuid::Uuid::now_v7().to_string(), name, now],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO entity_tag SELECT ?,?,id FROM tag WHERE name=? COLLATE NOCASE",
            params![r.entity_type.table(), r.id, name],
        )?;
    }
    Ok(())
}

/// Apply deletion, restoration or a star change without accepting SQL identifiers from IPC.
pub fn mutate(
    tx: &Transaction<'_>,
    r: &EntityRef,
    action: &str,
    now: i64,
    starred: bool,
) -> AppResult<()> {
    let table = r.entity_type.table();
    let exists: bool = tx.query_row(
        &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?)"),
        [&r.id],
        |r| r.get(0),
    )?;
    if !exists {
        return Err(AppError::NotFound);
    }
    if r.entity_type == EntityType::Todo && ["delete", "restore", "purge"].contains(&action) {
        let deleted: Option<i64> =
            tx.query_row("SELECT deleted_at FROM todo WHERE id=?", [&r.id], |row| {
                row.get(0)
            })?;
        if action == "restore" {
            let hidden_parent: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM todo child JOIN todo parent ON child.parent_id=parent.id WHERE child.id=? AND parent.deleted_at IS NOT NULL)", [&r.id], |row| row.get(0))?;
            if hidden_parent {
                return Err(AppError::Invalid("Restore the parent task first".into()));
            }
        }
        let mut stmt = tx.prepare("SELECT id FROM todo WHERE parent_id=? AND (?='purge' OR (?='delete' AND deleted_at IS NULL) OR (?='restore' AND deleted_at IS ?))")?;
        let children = stmt
            .query_map(params![r.id, action, action, action, deleted], |row| {
                row.get::<_, String>(0)
            })?
            .collect::<Result<Vec<_>, _>>()?;
        // Restore the parent first so child restoration cannot leave a hidden ancestor.
        if action == "restore" {
            tx.execute(
                "UPDATE todo SET deleted_at=NULL,updated_at=? WHERE id=?",
                params![now, r.id],
            )?;
        }
        for id in children {
            mutate(
                tx,
                &EntityRef {
                    entity_type: EntityType::Todo,
                    id,
                },
                action,
                now,
                false,
            )?;
        }
    }
    if r.entity_type == EntityType::Prompt && action != "star" {
        let system: bool = tx.query_row(
            "SELECT is_system_template FROM prompt WHERE id=?",
            [&r.id],
            |r| r.get(0),
        )?;
        if system {
            return Err(AppError::Invalid(
                "System templates cannot be deleted".into(),
            ));
        }
    }
    match action {
        "delete" => {
            tx.execute(
                &format!(
                    "UPDATE {table} SET deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL"
                ),
                params![now, now, r.id],
            )?;
        }
        "restore" => {
            tx.execute(
                &format!("UPDATE {table} SET deleted_at=NULL,updated_at=? WHERE id=?"),
                params![now, r.id],
            )?;
        }
        "purge" => {
            tx.execute(&format!("DELETE FROM {table} WHERE id=?"), [&r.id])?;
            tx.execute(
                "DELETE FROM entity_tag WHERE entity_type=? AND entity_id=?",
                params![table, r.id],
            )?;
        }
        "star" => {
            tx.execute(
                &format!(
                    "UPDATE {table} SET is_starred=?,updated_at=? WHERE id=? AND deleted_at IS NULL"
                ),
                params![starred, now, r.id],
            )?;
        }
        _ => return Err(AppError::Invalid("Unknown mutation".into())),
    }
    if action == "delete" || action == "purge" {
        super::search::remove(tx, r)?;
    } else {
        super::search::upsert(tx, r)?;
    }
    Ok(())
}

/// Build a parameterized filter with deterministic local-day boundaries.
pub fn filters(
    kind: EntityType,
    query: &ListQuery,
    today: &str,
    day_start: i64,
    day_end: i64,
) -> AppResult<(String, Vec<Value>, String)> {
    let table = kind.table();
    let mut sql = "deleted_at IS NULL".to_string();
    let mut args = vec![];
    if let Some(tag) = &query.tag {
        sql.push_str(&format!(" AND id IN (SELECT entity_id FROM entity_tag et JOIN tag t ON et.tag_id=t.id WHERE entity_type='{table}' AND t.name=? COLLATE NOCASE)"));
        args.push(Value::Text(tag.clone()));
    }
    if query.starred_only {
        sql.push_str(" AND is_starred=1");
    }
    let mut order = "is_starred DESC, updated_at DESC, id DESC".to_string();
    match kind {
        EntityType::Idea => {
            for (op, date) in [(">=", &query.date_from), ("<=", &query.date_to)] {
                if let Some(date) = date {
                    sql.push_str(&format!(" AND date {op} ?"));
                    args.push(Value::Text(date.clone()));
                }
            }
            order = "is_starred DESC,date DESC,created_at DESC,id DESC".into();
        }
        EntityType::Todo => {
            sql.push_str(" AND parent_id IS NULL");
            match query.view.as_deref().unwrap_or("all") {
                "today" => {
                    sql.push_str(" AND ((status='todo' AND due_date<=?) OR (status='done' AND completed_at>=? AND completed_at<?))");
                    args.extend([
                        Value::Text(today.into()),
                        Value::Integer(day_start),
                        Value::Integer(day_end),
                    ]);
                }
                "next7" => {
                    let date = chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d")
                        .map_err(|e| AppError::Invalid(e.to_string()))?;
                    sql.push_str(" AND status='todo' AND due_date BETWEEN ? AND ?");
                    args.extend([
                        Value::Text(today.into()),
                        Value::Text((date + chrono::Duration::days(6)).to_string()),
                    ]);
                }
                "all" => sql.push_str(" AND status='todo'"),
                "done" => sql.push_str(" AND status='done'"),
                _ => return Err(AppError::Invalid("Invalid todo view".into())),
            }
            order = if query.view.as_deref() == Some("done") {
                "completed_at DESC,id DESC"
            } else {
                "status='done',due_date IS NULL,due_date,priority,sort_order,created_at,id"
            }
            .into();
        }
        EntityType::Tip => {
            if let Some(tool) = &query.tool {
                sql.push_str(" AND EXISTS(SELECT 1 FROM json_each(tools) WHERE value=?)");
                args.push(Value::Text(tool.clone()));
            }
        }
        EntityType::Prompt => {
            sql.push_str(" AND is_system_template=?");
            args.push(Value::Integer(i64::from(query.system_only)));
            if let Some(category) = &query.category {
                sql.push_str(" AND category=?");
                args.push(Value::Text(category.clone()));
            }
        }
        EntityType::Skill => {}
        EntityType::Material => {
            if let Some(kind) = &query.material_kind {
                if !["work", "component"].contains(&kind.as_str()) {
                    return Err(AppError::Invalid("Invalid material kind".into()));
                }
                sql.push_str(" AND kind=?");
                args.push(Value::Text(kind.clone()));
            }
        }
    }
    Ok((sql, args, order))
}
