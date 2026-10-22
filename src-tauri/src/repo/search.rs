use crate::{
    domain::common::*,
    error::{AppError, AppResult},
};
use rusqlite::{Connection, Transaction, params, params_from_iter, types::Value};
use std::collections::HashMap;

/// Remove an entity's previous search projection.
pub fn remove(tx: &Transaction<'_>, r: &EntityRef) -> AppResult<()> {
    tx.execute(
        "DELETE FROM search_index WHERE entity_type=? AND entity_id=?",
        params![r.entity_type.table(), r.id],
    )?;
    Ok(())
}

/// Replace the FTS projection inside the same write transaction.
pub fn upsert(tx: &Transaction<'_>, r: &EntityRef) -> AppResult<()> {
    remove(tx, r)?;
    let (title, body, extra) = match r.entity_type {
        EntityType::Material => (
            "title",
            "note_md || ' ' || prompt || ' ' || coalesce(url,'') || ' ' || coalesce((SELECT group_concat(original_name,' ') FROM material_asset WHERE material_id=material.id),'')",
            "",
        ),
        EntityType::Idea => ("content_md", "content_md", ""),
        EntityType::Todo => ("title", "note_md", ""),
        EntityType::Tip => ("title", "content_md || ' ' || tools", ""),
        EntityType::Skill => (
            "name",
            "description || ' ' || coalesce(content_md,'') || ' ' || note || ' ' || coalesce(url,'')",
            "",
        ),
        EntityType::Prompt => (
            "title",
            "body || ' ' || category",
            " AND is_system_template=0",
        ),
    };
    let sql = format!(
        "INSERT INTO search_index(entity_type,entity_id,title,body,tags) SELECT ?,id,{title},{body},coalesce((SELECT group_concat(t.name,' ') FROM entity_tag et JOIN tag t ON t.id=et.tag_id WHERE et.entity_type=? AND et.entity_id={}.id),'') FROM {} WHERE id=? AND deleted_at IS NULL{extra}",
        r.entity_type.table(),
        r.entity_type.table()
    );
    tx.execute(
        &sql,
        params![r.entity_type.table(), r.entity_type.table(), r.id],
    )?;
    Ok(())
}

/// Search trigram phrases, falling back to escaped LIKE for short terms.
pub fn query(conn: &Connection, q: &str, limit: u32) -> AppResult<Vec<SearchHit>> {
    let mut words = vec![];
    let mut tags = vec![];
    let mut kind_filter = None;
    let mut starred = false;
    for token in q.split_whitespace() {
        if let Some(tag) = token.strip_prefix("tag:").filter(|s| !s.is_empty()) {
            tags.push(tag);
        } else if let Some(kind) = token.strip_prefix("type:") {
            if !EntityType::ALL.iter().any(|k| k.table() == kind) {
                return Err(AppError::Invalid("Invalid search type".into()));
            }
            kind_filter = Some(kind);
        } else if token == "is:starred" {
            starred = true;
        } else if words.len() < 5 {
            words.push(token);
        }
    }
    if words.is_empty() && tags.is_empty() && kind_filter.is_none() && !starred {
        return Ok(vec![]);
    }
    let mut args: Vec<Value> = vec![];
    let fts = !words.is_empty() && words.iter().all(|w| w.chars().count() >= 3);
    let mut condition = if words.is_empty() {
        "1=1".into()
    } else if fts {
        args.push(Value::Text(
            words
                .iter()
                .map(|w| format!("\"{}\"", w.replace('"', "\"\"")))
                .collect::<Vec<_>>()
                .join(" AND "),
        ));
        "search_index MATCH ?".into()
    } else {
        words
            .iter()
            .map(|w| {
                let escaped = w.replace('!', "!!").replace('%', "!%").replace('_', "!_");
                for _ in 0..3 {
                    args.push(Value::Text(format!("%{escaped}%")));
                }
                "(title LIKE ? ESCAPE '!' OR body LIKE ? ESCAPE '!' OR tags LIKE ? ESCAPE '!')"
            })
            .collect::<Vec<_>>()
            .join(" AND ")
    };
    if let Some(kind) = kind_filter {
        condition.push_str(" AND entity_type=?");
        args.push(Value::Text(kind.into()));
    }
    for tag in tags {
        condition.push_str(" AND EXISTS(SELECT 1 FROM entity_tag et JOIN tag t ON et.tag_id=t.id WHERE et.entity_type=search_index.entity_type AND et.entity_id=search_index.entity_id AND t.name=? COLLATE NOCASE)");
        args.push(Value::Text(tag.into()));
    }
    if starred {
        condition.push_str(&format!(
            " AND CASE entity_type {} END=1",
            EntityType::ALL
                .iter()
                .map(|k| format!(
                    "WHEN '{}' THEN (SELECT is_starred FROM {} WHERE id=search_index.entity_id)",
                    k.table(),
                    k.table()
                ))
                .collect::<Vec<_>>()
                .join(" ")
        ));
    }
    let updated_at = EntityType::ALL
        .iter()
        .map(|k| {
            format!(
                "WHEN '{}' THEN (SELECT updated_at FROM {} WHERE id=search_index.entity_id)",
                k.table(),
                k.table()
            )
        })
        .collect::<Vec<_>>()
        .join(" ");
    let order = if fts {
        "bm25(search_index),updated_at DESC"
    } else {
        "updated_at DESC"
    };
    // A compound-table join can make SQLite rescan the unindexed FTS metadata
    // for every entity. Correlated primary-key lookups keep this one FTS scan.
    let mut stmt=conn.prepare(&format!("SELECT entity_type,entity_id,title,body,CASE entity_type {updated_at} END AS updated_at FROM search_index WHERE {condition} ORDER BY {order}"))?;
    let mut rows = stmt.query(params_from_iter(args))?;
    let mut result = vec![];
    let mut counts = HashMap::new();
    while let Some(row) = rows.next()? {
        let kind: String = row.get(0)?;
        let Some(entity_type) = EntityType::ALL.into_iter().find(|k| k.table() == kind) else {
            continue;
        };
        let count = counts.entry(entity_type).or_insert(0_u32);
        if *count >= limit.clamp(1, 50) {
            continue;
        }
        *count += 1;
        let body: String = row.get(3)?;
        let chars: Vec<char> = body.chars().collect();
        let lower = body.to_lowercase();
        let pos = words
            .iter()
            .filter_map(|w| lower.find(&w.to_lowercase()))
            .min()
            .map(|byte| lower[..byte].chars().count())
            .unwrap_or(0);
        let start = pos.saturating_sub(40).min(chars.len());
        let end = (pos + 80).min(chars.len());
        let title: String = row.get(2)?;
        result.push(SearchHit {
            entity_type,
            id: row.get(1)?,
            title: title
                .lines()
                .next()
                .unwrap_or("")
                .trim_start_matches(['#', '*', ' '])
                .chars()
                .take(80)
                .collect(),
            snippet: chars[start..end].iter().collect(),
            updated_at: row.get(4)?,
        });
    }
    Ok(result)
}
