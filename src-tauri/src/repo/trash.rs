use crate::{domain::common::*, error::AppResult};
use rusqlite::{Connection, Transaction};
/// Return deleted records across all six modules.
pub fn list(conn: &Connection) -> AppResult<Vec<TrashItem>> {
    let mut items = vec![];
    for kind in EntityType::ALL {
        let title = match kind {
            EntityType::Idea => "content_md",
            EntityType::Skill => "name",
            _ => "title",
        };
        let extra = if kind == EntityType::Todo {
            " AND (parent_id IS NULL OR NOT EXISTS(SELECT 1 FROM todo parent WHERE parent.id=todo.parent_id AND parent.deleted_at IS NOT NULL))"
        } else {
            ""
        };
        let mut stmt = conn.prepare(&format!(
            "SELECT id,{title},deleted_at,{} FROM {} WHERE deleted_at IS NOT NULL{extra}",
            if kind == EntityType::Material {
                "kind"
            } else {
                "NULL"
            },
            kind.table()
        ))?;
        items.extend(
            stmt.query_map([], |r| {
                Ok(TrashItem {
                    r#ref: EntityRef {
                        entity_type: kind,
                        id: r.get(0)?,
                    },
                    title: r
                        .get::<_, String>(1)?
                        .lines()
                        .next()
                        .unwrap_or("")
                        .chars()
                        .take(80)
                        .collect(),
                    deleted_at: r.get(2)?,
                    material_kind: r.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?,
        );
    }
    items.sort_by_key(|i| std::cmp::Reverse(i.deleted_at));
    Ok(items)
}
/// Expire records only after the full 30-day retention period.
pub fn cleanup(tx: &Transaction<'_>, now: i64) -> AppResult<()> {
    for item in list(tx)? {
        if item.deleted_at < now - 30 * 86400000 {
            let exists: bool = tx.query_row(
                &format!(
                    "SELECT EXISTS(SELECT 1 FROM {} WHERE id=?)",
                    item.r#ref.entity_type.table()
                ),
                [&item.r#ref.id],
                |r| r.get(0),
            )?;
            if exists {
                super::common::mutate(tx, &item.r#ref, "purge", now, false)?;
            }
        }
    }
    Ok(())
}
