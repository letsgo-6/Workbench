use crate::{
    db::Db,
    domain::{
        common::{EntityRef, EntityType},
        data::ImportReport,
    },
    error::{AppError, AppResult, ErrorCode},
    repo,
};
use rusqlite::{
    Connection, OptionalExtension, Transaction, params, params_from_iter, types::Value as SqlValue,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::{HashMap, HashSet},
    path::Path,
};
const TABLES: [(&str, &str); 13] = [
    ("ideas", "idea"),
    ("todos", "todo"),
    ("tips", "tip"),
    ("skills", "skill"),
    ("prompts", "prompt"),
    ("materials", "material"),
    ("materialAssets", "material_asset"),
    ("tags", "tag"),
    ("entityTags", "entity_tag"),
    ("aiProviders", "ai_provider"),
    ("promptVersions", "prompt_version"),
    ("aiConversations", "ai_conversation"),
    ("aiMessages", "ai_message"),
];
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Backup {
    pub(crate) app: String,
    pub(crate) format_version: u32,
    pub(crate) schema_version: u32,
    pub(crate) exported_at: i64,
    pub(crate) data: Map<String, Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) asset_hashes: Option<std::collections::BTreeMap<String, String>>,
}
fn invalid() -> AppError {
    AppError::coded(
        ErrorCode::ImportInvalid,
        "Invalid backup format or unsupported version",
    )
}
fn columns(conn: &Connection, table: &str) -> AppResult<Vec<String>> {
    Ok(conn
        .prepare(&format!("PRAGMA table_info({table})"))?
        .query_map([], |r| r.get(1))?
        .collect::<Result<Vec<_>, _>>()?)
}
fn rows(conn: &Connection, table: &str) -> AppResult<Vec<Value>> {
    let mut stmt = conn.prepare(&format!("SELECT * FROM {table}"))?;
    let names = stmt
        .column_names()
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>();
    Ok(stmt
        .query_map([], |row| {
            let mut map = Map::new();
            for (i, name) in names.iter().enumerate() {
                let value = match row.get_ref(i)? {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(n) => n.into(),
                    rusqlite::types::ValueRef::Real(n) => serde_json::json!(n),
                    rusqlite::types::ValueRef::Text(s) => {
                        String::from_utf8_lossy(s).into_owned().into()
                    }
                    rusqlite::types::ValueRef::Blob(_) => Value::Null,
                };
                map.insert(name.clone(), value);
            }
            Ok(Value::Object(map))
        })?
        .collect::<Result<Vec<_>, _>>()?)
}
/// Export every raw business column, including tombstones, without FTS or credentials.
pub fn export(conn: &Connection) -> AppResult<Backup> {
    let mut data = Map::new();
    for (name, table) in TABLES {
        data.insert(name.into(), rows(conn, table)?.into());
    }
    let mut settings = Map::new();
    for value in rows(conn, "setting")? {
        if let (Some(k), Some(v)) = (value["key"].as_str(), value["value"].as_str()) {
            if k == "capture.smartDefault" {
                continue;
            }
            settings.insert(k.into(), serde_json::from_str(v)?);
        }
    }
    data.insert("settings".into(), Value::Object(settings));
    Ok(Backup {
        app: "workbench".into(),
        format_version: 1,
        schema_version: 3,
        exported_at: chrono::Utc::now().timestamp_millis(),
        data,
        asset_hashes: None,
    })
}
#[cfg(test)]
pub fn export_v2_fixture(conn: &Connection) -> AppResult<Backup> {
    let mut backup = export(conn)?;
    backup.schema_version = 2;
    backup.data.remove("materials");
    backup.data.remove("materialAssets");
    Ok(backup)
}
/// Decode and validate against the fixed schema before touching live data or credentials.
pub fn read(conn: &Connection, path: &Path) -> AppResult<Backup> {
    if std::fs::metadata(path)?.len() > 50_000_000 {
        return Err(invalid());
    }
    decode(conn, &std::fs::read(path)?)
}
/// Validate JSON before files, credentials or live database rows are touched.
pub fn decode(conn: &Connection, bytes: &[u8]) -> AppResult<Backup> {
    if bytes.len() > 50_000_000 {
        return Err(invalid());
    }
    let mut backup: Backup = serde_json::from_slice(bytes).map_err(|_| invalid())?;
    if backup.app != "workbench"
        || backup.format_version != 1
        || !(1..=3).contains(&backup.schema_version)
        || backup.data.len()
            != match backup.schema_version {
                1 => 9,
                2 => 12,
                _ => 14,
            }
    {
        return Err(invalid());
    }
    if backup.schema_version < 3 {
        for key in ["materials", "materialAssets"] {
            backup.data.insert(key.into(), Value::Array(vec![]));
        }
    }
    if backup.schema_version == 1 {
        for key in ["promptVersions", "aiConversations", "aiMessages"] {
            backup.data.insert(key.into(), Value::Array(vec![]));
        }
        for row in backup
            .data
            .get_mut("todos")
            .and_then(Value::as_array_mut)
            .ok_or_else(invalid)?
        {
            let obj = row.as_object_mut().ok_or_else(invalid)?;
            // A v1 backup must really have the old columns; don't conceal malformed input.
            if obj.contains_key("remind_at") || obj.contains_key("reminded_at") {
                return Err(invalid());
            }
            obj.insert("remind_at".into(), Value::Null);
            obj.insert("reminded_at".into(), Value::Null);
        }
    }
    for (key, table) in TABLES {
        let cols = columns(conn, table)?;
        let list = backup
            .data
            .get(key)
            .and_then(Value::as_array)
            .ok_or_else(invalid)?;
        let mut ids = HashSet::new();
        for row in list {
            let obj = row.as_object().ok_or_else(invalid)?;
            if obj.len() != cols.len()
                || !cols.iter().all(|c| obj.contains_key(c))
                || obj.values().any(|v| {
                    v.is_object() || v.is_array() || v.as_str().is_some_and(|s| s.len() > 1_048_576)
                })
            {
                return Err(invalid());
            }
            if table != "entity_tag" && !ids.insert(row["id"].as_str().ok_or_else(invalid)?) {
                return Err(invalid());
            }
            if table == "ai_provider" {
                super::providers::validate_url(row["base_url"].as_str().ok_or_else(invalid)?)
                    .map_err(|_| invalid())?;
            }
            if table == "material_asset" {
                let name = row["file_name"].as_str().ok_or_else(invalid)?;
                let id = row["id"].as_str().ok_or_else(invalid)?;
                let (media_kind, mime) = match std::path::Path::new(name)
                    .extension()
                    .and_then(|e| e.to_str())
                {
                    Some("png") => ("image", "image/png"),
                    Some("jpg" | "jpeg") => ("image", "image/jpeg"),
                    Some("webp") => ("image", "image/webp"),
                    Some("gif") => ("gif", "image/gif"),
                    Some("mp4") => ("video", "video/mp4"),
                    Some("webm") => ("video", "video/webm"),
                    _ => return Err(invalid()),
                };
                if row["media_kind"].as_str() != Some(media_kind)
                    || row["mime"].as_str() != Some(mime)
                    || row["size_bytes"].as_u64().is_none_or(|s| {
                        s > if media_kind == "video" {
                            super::assets::VIDEO_LIMIT
                        } else {
                            super::assets::IMAGE_LIMIT
                        }
                    })
                {
                    return Err(invalid());
                }
                if !super::assets::valid_relative(name)
                    || std::path::Path::new(name)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        != Some(id)
                    || row["sha256"].as_str().is_none_or(|s| {
                        s.len() != 64
                            || !s
                                .bytes()
                                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                    })
                    || row["size_bytes"]
                        .as_u64()
                        .is_none_or(|n| n == 0 || n > super::assets::VIDEO_LIMIT)
                {
                    return Err(invalid());
                }
                if !row["thumb_name"].is_null()
                    && row["thumb_name"].as_str() != Some(format!("thumbs/{id}.webp").as_str())
                {
                    return Err(invalid());
                }
            }
            if table == "material" {
                let text = |key| row[key].as_str().map(str::to_string).ok_or_else(invalid);
                let mut input = crate::domain::material::MaterialInput {
                    kind: text("kind")?,
                    title: text("title")?,
                    note_md: text("note_md")?,
                    prompt: text("prompt")?,
                    url: if row["url"].is_null() {
                        None
                    } else {
                        Some(text("url")?)
                    },
                    ..Default::default()
                };
                super::assets::validate_input(&mut input).map_err(|_| invalid())?;
            }
            if table == "ai_message" {
                let refs: Vec<EntityRef> =
                    serde_json::from_str(row["refs"].as_str().ok_or_else(invalid)?)
                        .map_err(|_| invalid())?;
                if refs.len() > 20 {
                    return Err(invalid());
                }
            }
        }
    }
    backup
        .data
        .get("settings")
        .and_then(Value::as_object)
        .ok_or_else(invalid)?;
    Ok(backup)
}
fn sql_value(v: &Value) -> AppResult<SqlValue> {
    match v {
        Value::Null => Ok(SqlValue::Null),
        Value::String(s) => Ok(SqlValue::Text(s.clone())),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(SqlValue::Integer(i))
            } else {
                n.as_f64().map(SqlValue::Real).ok_or_else(invalid)
            }
        }
        Value::Bool(b) => Ok(SqlValue::Integer(i64::from(*b))),
        _ => Err(invalid()),
    }
}
fn insert(tx: &Transaction<'_>, table: &str, row: &Value) -> AppResult<()> {
    let cols = columns(tx, table)?;
    let placeholders = vec!["?"; cols.len()].join(",");
    let values = cols
        .iter()
        .map(|c| sql_value(&row[c]))
        .collect::<AppResult<Vec<_>>>()?;
    let updates = cols
        .iter()
        .filter(|c| c.as_str() != "id")
        .map(|c| format!("{c}=excluded.{c}"))
        .collect::<Vec<_>>()
        .join(",");
    tx.execute(&format!("INSERT INTO {table}({}) VALUES ({placeholders}) ON CONFLICT(id) DO UPDATE SET {updates}",cols.join(",")),params_from_iter(values))?;
    Ok(())
}
/// Apply validated raw rows in one transaction and rebuild all live FTS projections.
pub fn apply(tx: &Transaction<'_>, backup: &Backup, mode: &str) -> AppResult<ImportReport> {
    if !["merge", "overwrite"].contains(&mode) {
        return Err(invalid());
    }
    tx.execute_batch("PRAGMA defer_foreign_keys=ON;")?;
    if mode == "overwrite" {
        tx.execute_batch("DELETE FROM material_asset;DELETE FROM material;DELETE FROM ai_message;DELETE FROM ai_conversation;DELETE FROM prompt_version;DELETE FROM entity_tag;DELETE FROM todo;DELETE FROM idea;DELETE FROM tip;DELETE FROM skill;DELETE FROM prompt;DELETE FROM tag;DELETE FROM ai_provider;DELETE FROM setting;DELETE FROM search_index;")?;
    }
    let mut report = ImportReport {
        inserted: 0,
        updated: 0,
        skipped: 0,
    };
    let mut winners = HashSet::new();
    let mut tag_map = HashMap::new();
    for row in backup.data["tags"].as_array().ok_or_else(invalid)? {
        let name = row["name"].as_str().ok_or_else(invalid)?;
        let id = row["id"].as_str().ok_or_else(invalid)?;
        let local: Option<String> = tx
            .query_row(
                "SELECT id FROM tag WHERE name=? COLLATE NOCASE",
                [name],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(local) = local {
            tag_map.insert(id.to_string(), local);
        } else {
            let exists: bool =
                tx.query_row("SELECT EXISTS(SELECT 1 FROM tag WHERE id=?)", [id], |r| {
                    r.get(0)
                })?;
            if !exists {
                insert(tx, "tag", row)?;
                report.inserted += 1;
            }
            tag_map.insert(id.to_string(), id.to_string());
        }
    }
    let mut entity_ids: HashMap<(String, String), String> = HashMap::new();
    for (key, table) in TABLES {
        if ["tag", "entity_tag"].contains(&table) {
            continue;
        }
        for source in backup.data[key].as_array().ok_or_else(invalid)? {
            let mut row = source.clone();
            if table == "prompt_version" {
                let old = source["prompt_id"].as_str().ok_or_else(invalid)?;
                if let Some(id) = entity_ids.get(&("prompt".to_string(), old.to_string())) {
                    row["prompt_id"] = Value::String(id.clone());
                }
            }
            if table == "prompt" && source["is_system_template"].as_i64() == Some(1) {
                let canonical: Option<String> = tx
                    .query_row(
                        "SELECT id FROM prompt WHERE template_key=?",
                        [source["template_key"].as_str().ok_or_else(invalid)?],
                        |r| r.get(0),
                    )
                    .optional()?;
                if let Some(id) = canonical {
                    row["id"] = id.into();
                }
            }
            let id = row["id"].as_str().ok_or_else(invalid)?;
            if table == "material_asset" {
                let material = row["material_id"].as_str().ok_or_else(invalid)?;
                let previous: Option<(String, String)> = tx
                    .query_row(
                        "SELECT sha256,file_name FROM material_asset WHERE id=?",
                        [id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .optional()?;
                if let Some((hash, name)) = &previous
                    && (Some(hash.as_str()) != row["sha256"].as_str()
                        || Some(name.as_str()) != row["file_name"].as_str())
                {
                    return Err(invalid());
                }
                if !winners.contains(&("material".into(), material.into())) {
                    report.skipped += 1;
                    continue;
                }
                insert(tx, table, &row)?;
                if previous.is_some() {
                    report.updated += 1;
                } else {
                    report.inserted += 1;
                }
                continue;
            }
            entity_ids.insert(
                (
                    table.to_string(),
                    source["id"].as_str().ok_or_else(invalid)?.to_string(),
                ),
                id.to_string(),
            );
            let stamp = if ["prompt_version", "ai_message"].contains(&table) {
                "created_at"
            } else {
                "updated_at"
            };
            let existing: Option<i64> = tx
                .query_row(
                    &format!("SELECT {stamp} FROM {table} WHERE id=?"),
                    [id],
                    |r| r.get(0),
                )
                .optional()?;
            if existing.is_some_and(|n| n >= row[stamp].as_i64().unwrap_or(i64::MIN)) {
                report.skipped += 1;
                continue;
            }
            insert(tx, table, &row)?;
            if existing.is_some() {
                report.updated += 1;
            } else {
                report.inserted += 1;
            }
            if EntityType::ALL.iter().any(|kind| kind.table() == table) {
                winners.insert((table.to_string(), id.to_string()));
                tx.execute(
                    "DELETE FROM entity_tag WHERE entity_type=? AND entity_id=?",
                    params![table, id],
                )?;
            }
        }
    }
    for row in backup.data["entityTags"].as_array().ok_or_else(invalid)? {
        let table = row["entity_type"].as_str().ok_or_else(invalid)?;
        let id = row["entity_id"].as_str().ok_or_else(invalid)?;
        let id = entity_ids
            .get(&(table.to_string(), id.to_string()))
            .map(String::as_str)
            .unwrap_or(id);
        if !EntityType::ALL.iter().any(|t| t.table() == table) {
            return Err(invalid());
        }
        if !winners.contains(&(table.into(), id.into())) {
            continue;
        }
        let tag = tag_map
            .get(row["tag_id"].as_str().ok_or_else(invalid)?)
            .ok_or_else(invalid)?;
        tx.execute(
            "INSERT OR IGNORE INTO entity_tag(entity_type,entity_id,tag_id) VALUES (?,?,?)",
            params![table, id, tag],
        )?;
    }
    for (key, value) in backup.data["settings"].as_object().ok_or_else(invalid)? {
        if key == "capture.smartDefault" {
            continue;
        }
        repo::settings::set(tx, key, value).map_err(|_| invalid())?;
    }
    tx.execute("UPDATE ai_provider SET is_default=(id=(SELECT id FROM ai_provider ORDER BY is_default DESC,sort_order,created_at LIMIT 1))",[])?;
    let nested:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM todo child JOIN todo parent ON child.parent_id=parent.id WHERE parent.parent_id IS NOT NULL)",[],|r|r.get(0))?;
    if nested {
        return Err(invalid());
    }
    let bad_cover:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM material m WHERE cover_asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM material_asset a WHERE a.id=m.cover_asset_id AND a.material_id=m.id))",[],|r|r.get(0))?;
    if bad_cover {
        return Err(invalid());
    }
    tx.execute("DELETE FROM prompt_version WHERE id IN (SELECT id FROM (SELECT id,row_number() OVER (PARTITION BY prompt_id ORDER BY created_at DESC,id DESC) n FROM prompt_version) WHERE n>50)",[])?;
    tx.execute("DELETE FROM search_index", [])?;
    for entity_type in EntityType::ALL {
        let mut stmt = tx.prepare(&format!(
            "SELECT id FROM {} WHERE deleted_at IS NULL",
            entity_type.table()
        ))?;
        let ids = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        for id in ids {
            repo::search::upsert(tx, &EntityRef { entity_type, id })?;
        }
    }
    super::ai::actions::seed_system_templates(tx)?;
    Ok(report)
}
/// Create a consistent standalone database copy while holding the database lock.
pub fn snapshot(db: &Db, path: &Path) -> AppResult<()> {
    db.with_conn(|conn| {
        conn.execute("VACUUM INTO ?", [path.to_string_lossy().as_ref()])?;
        Ok(())
    })
}
/// Imported provider identifiers whose credentials must be re-entered.
pub fn provider_ids(backup: &Backup) -> Vec<String> {
    backup.data["aiProviders"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|v| v["id"].as_str().map(str::to_string))
        .collect()
}
/// Import with a consistent pre-import snapshot and compensating credential rollback.
pub fn import(
    db: &Db,
    secrets: &super::secrets::SecretStore,
    backups: &Path,
    path: &Path,
    mode: &str,
) -> AppResult<ImportReport> {
    if !["merge", "overwrite"].contains(&mode) {
        return Err(invalid());
    }
    let backup = db.with_conn(|c| read(c, path))?;
    snapshot(
        db,
        &backups.join(format!("pre-import-{}.db", uuid::Uuid::now_v7())),
    )?;
    let mut ids = provider_ids(&backup);
    if mode == "overwrite" {
        ids.extend(
            db.with_conn(repo::providers::list)?
                .into_iter()
                .map(|p| p.id),
        );
    }
    ids.sort();
    ids.dedup();
    let mut old = vec![];
    for id in &ids {
        old.push((id.clone(), secrets.get(id)?));
    }
    for (id, _) in &old {
        if let Err(error) = secrets.delete(id) {
            for (id, key) in &old {
                if let Some(key) = key {
                    secrets.set(id, key)?;
                }
            }
            return Err(error);
        }
    }
    let result = db.with_tx(|tx| apply(tx, &backup, mode));
    if result.is_err() {
        for (id, key) in old {
            if let Some(key) = key {
                secrets.set(&id, &key)?;
            }
        }
    }
    result.map_err(|_| invalid())
}
