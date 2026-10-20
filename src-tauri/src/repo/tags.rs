use crate::{
    domain::common::*,
    error::{AppError, AppResult},
};
use rusqlite::{Connection, Transaction, params};
/// List tag names and their live-use counts.
pub fn list(conn: &Connection) -> AppResult<Vec<Tag>> {
    let mut stmt=conn.prepare("SELECT t.id,t.name,t.color,(SELECT count(*) FROM entity_tag e JOIN search_index s ON s.entity_type=e.entity_type AND s.entity_id=e.entity_id WHERE e.tag_id=t.id) FROM tag t ORDER BY t.name COLLATE NOCASE")?;
    Ok(stmt
        .query_map([], |r| {
            Ok(Tag {
                id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                use_count: r.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?)
}
/// Rename, recolor or delete a tag; refresh every affected search row.
pub fn change(
    tx: &Transaction<'_>,
    id: &str,
    name: Option<&str>,
    color: Option<&str>,
    delete: bool,
    now: i64,
) -> AppResult<()> {
    let mut stmt = tx.prepare("SELECT entity_type,entity_id FROM entity_tag WHERE tag_id=?")?;
    let pairs = stmt
        .query_map([id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let changed = if delete {
        tx.execute("DELETE FROM tag WHERE id=?", [id])?
    } else if let Some(name) = name {
        if name.trim().is_empty() || name.chars().count() > 100 {
            return Err(AppError::Invalid("Invalid tag name".into()));
        }
        tx.execute("UPDATE tag SET name=? WHERE id=?", params![name.trim(), id])?
    } else {
        tx.execute("UPDATE tag SET color=? WHERE id=?", params![color, id])?
    };
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    for (kind, id) in pairs {
        if let Some(entity_type) = EntityType::ALL.into_iter().find(|k| k.table() == kind) {
            tx.execute(
                &format!("UPDATE {} SET updated_at=? WHERE id=?", entity_type.table()),
                params![now, id],
            )?;
            super::search::upsert(tx, &EntityRef { entity_type, id })?;
        }
    }
    Ok(())
}
