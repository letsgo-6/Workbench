use crate::{
    domain::{common::*, material::*},
    error::{AppError, AppResult},
};
use rusqlite::{
    Connection, OptionalExtension, Transaction, params, params_from_iter, types::Value,
};

#[derive(Clone)]
pub struct AssetRecord {
    pub id: String,
    pub material_id: String,
    pub media_kind: String,
    pub mime: String,
    pub file_name: String,
    pub original_name: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_ms: Option<u32>,
    pub thumb_name: Option<String>,
    pub sort_order: f64,
    pub created_at: i64,
}
impl AssetRecord {
    /// Relative paths are resolved only by the assets service at the IPC boundary.
    pub fn view(&self) -> MaterialAsset {
        MaterialAsset {
            id: self.id.clone(),
            media_kind: self.media_kind.clone(),
            mime: self.mime.clone(),
            original_name: self.original_name.clone(),
            size_bytes: self.size_bytes,
            width: self.width,
            height: self.height,
            duration_ms: self.duration_ms,
            path: self.file_name.clone(),
            thumb_path: self.thumb_name.clone(),
            missing: false,
        }
    }
}
/// Read stored asset metadata without performing filesystem operations.
pub fn asset_records(conn: &Connection, material: Option<&str>) -> AppResult<Vec<AssetRecord>> {
    Ok(conn.prepare("SELECT * FROM material_asset WHERE (?1 IS NULL OR material_id=?1) ORDER BY sort_order,id")?.query_map([material], map_asset)?.collect::<Result<Vec<_>, _>>()?)
}
fn map_asset(r: &rusqlite::Row<'_>) -> rusqlite::Result<AssetRecord> {
    Ok(AssetRecord {
        id: r.get("id")?,
        material_id: r.get("material_id")?,
        media_kind: r.get("media_kind")?,
        mime: r.get("mime")?,
        file_name: r.get("file_name")?,
        original_name: r.get("original_name")?,
        size_bytes: r.get::<_, i64>("size_bytes")? as u64,
        sha256: r.get("sha256")?,
        width: r.get("width")?,
        height: r.get("height")?,
        duration_ms: r.get("duration_ms")?,
        thumb_name: r.get("thumb_name")?,
        sort_order: r.get("sort_order")?,
        created_at: r.get("created_at")?,
    })
}
fn map(row: &rusqlite::Row<'_>) -> rusqlite::Result<Material> {
    Ok(Material {
        id: row.get("id")?,
        kind: row.get("kind")?,
        title: row.get("title")?,
        url: row.get("url")?,
        note_md: row.get("note_md")?,
        prompt: row.get("prompt")?,
        cover_asset_id: row.get("cover_asset_id")?,
        assets: vec![],
        is_starred: row.get("is_starred")?,
        origin: super::common::origin(row)?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
        tags: vec![],
    })
}
/// Read a live material and its ordered assets and tags.
pub fn get(conn: &Connection, id: &str) -> AppResult<Material> {
    let mut item = conn
        .query_row(
            "SELECT * FROM material WHERE id=? AND deleted_at IS NULL",
            [id],
            map,
        )
        .optional()?
        .ok_or(AppError::NotFound)?;
    item.tags = super::common::load_tags_for(conn, EntityType::Material, &[id.into()])?
        .remove(id)
        .unwrap_or_default();
    item.assets = asset_records(conn, Some(id))?
        .iter()
        .map(AssetRecord::view)
        .collect();
    Ok(item)
}
/// Page materials, sharing the ordinary tag/star filter contract.
pub fn list(conn: &Connection, query: &ListQuery) -> AppResult<Page<Material>> {
    let (filter, mut args, order) = super::common::filters(EntityType::Material, query, "", 0, 0)?;
    let total = conn.query_row(
        &format!("SELECT count(*) FROM material WHERE {filter}"),
        params_from_iter(args.clone()),
        |r| r.get(0),
    )?;
    args.extend([
        Value::Integer(i64::from(query.limit.unwrap_or(60).clamp(1, 200))),
        Value::Integer(i64::from(query.offset)),
    ]);
    let mut items = conn
        .prepare(&format!(
            "SELECT * FROM material WHERE {filter} ORDER BY {order} LIMIT ? OFFSET ?"
        ))?
        .query_map(params_from_iter(args), map)?
        .collect::<Result<Vec<_>, _>>()?;
    let ids = items.iter().map(|item| item.id.clone()).collect::<Vec<_>>();
    let mut tags = super::common::load_tags_for(conn, EntityType::Material, &ids)?;
    let mut assets: std::collections::HashMap<String, Vec<MaterialAsset>> =
        std::collections::HashMap::new();
    if !ids.is_empty() {
        let slots = vec!["?"; ids.len()].join(",");
        let records = conn
            .prepare(&format!(
                "SELECT * FROM material_asset WHERE material_id IN ({slots}) ORDER BY sort_order,id"
            ))?
            .query_map(params_from_iter(&ids), map_asset)?
            .collect::<Result<Vec<_>, _>>()?;
        for asset in records {
            assets
                .entry(asset.material_id.clone())
                .or_default()
                .push(asset.view());
        }
    }
    for item in &mut items {
        item.tags = tags.remove(&item.id).unwrap_or_default();
        item.assets = assets.remove(&item.id).unwrap_or_default();
    }
    Ok(Page { items, total })
}
/// Create a text-only draft; imported files are attached only after complete writes.
pub fn create(
    tx: &Transaction<'_>,
    input: &MaterialInput,
    now: i64,
    origin: Option<&Origin>,
) -> AppResult<Material> {
    if input.cover_asset_id.is_some() {
        return Err(AppError::Invalid(
            "New material cannot reference another cover".into(),
        ));
    }
    let id = uuid::Uuid::now_v7().to_string();
    tx.execute("INSERT INTO material(id,kind,title,url,note_md,prompt,origin_type,origin_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",params![id,input.kind,input.title,input.url,input.note_md,input.prompt,origin.map(|o|o.entity_type.table()),origin.map(|o|&o.id),now,now])?;
    let r = EntityRef {
        entity_type: EntityType::Material,
        id: id.clone(),
    };
    super::common::set_tags(tx, &r, &input.tags, now)?;
    super::search::upsert(tx, &r)?;
    get(tx, &id)
}
/// Replace all editable metadata, validating cover ownership.
pub fn update(
    tx: &Transaction<'_>,
    id: &str,
    input: &MaterialInput,
    now: i64,
) -> AppResult<Material> {
    get(tx, id)?;
    if let Some(cover) = &input.cover_asset_id {
        check_asset(tx, id, cover)?;
    }
    tx.execute("UPDATE material SET kind=?,title=?,url=?,note_md=?,prompt=?,cover_asset_id=?,updated_at=? WHERE id=?",params![input.kind,input.title,input.url,input.note_md,input.prompt,input.cover_asset_id,now,id])?;
    let r = EntityRef {
        entity_type: EntityType::Material,
        id: id.into(),
    };
    super::common::set_tags(tx, &r, &input.tags, now)?;
    super::search::upsert(tx, &r)?;
    get(tx, id)
}
/// Validate an asset belongs to the selected live material.
pub fn check_asset(conn: &Connection, material: &str, asset: &str) -> AppResult<()> {
    if !conn.query_row("SELECT EXISTS(SELECT 1 FROM material_asset a JOIN material m ON m.id=a.material_id WHERE a.id=? AND a.material_id=? AND m.deleted_at IS NULL)",params![asset,material],|r|r.get::<_,bool>(0))? {return Err(AppError::NotFound);}
    Ok(())
}
/// Attach an already persisted file, skipping same-material hashes.
pub fn add_asset(
    tx: &Transaction<'_>,
    material: &str,
    a: &AssetRecord,
    now: i64,
) -> AppResult<bool> {
    get(tx, material)?;
    if tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM material_asset WHERE material_id=? AND sha256=?)",
        params![material, a.sha256],
        |r| r.get::<_, bool>(0),
    )? {
        return Ok(false);
    }
    tx.execute("INSERT INTO material_asset(id,material_id,media_kind,mime,file_name,original_name,size_bytes,sha256,width,height,duration_ms,thumb_name,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,coalesce((SELECT max(sort_order)+1 FROM material_asset WHERE material_id=?),0),?)",params![a.id,material,a.media_kind,a.mime,a.file_name,a.original_name,a.size_bytes as i64,a.sha256,a.width,a.height,a.duration_ms,a.thumb_name,material,now])?;
    touch(tx, material, now)?;
    Ok(true)
}
/// Refresh parent modification time and search after asset metadata changes.
pub fn touch(tx: &Transaction<'_>, material: &str, now: i64) -> AppResult<()> {
    tx.execute(
        "UPDATE material SET updated_at=? WHERE id=?",
        params![now, material],
    )?;
    super::search::upsert(
        tx,
        &EntityRef {
            entity_type: EntityType::Material,
            id: material.into(),
        },
    )
}
/// Reorder exactly the selected material's complete set of files.
pub fn reorder(tx: &Transaction<'_>, input: &AssetOrderInput, now: i64) -> AppResult<()> {
    get(tx, &input.material_id)?;
    let current = asset_records(tx, Some(&input.material_id))?;
    let ids = input.ids.iter().collect::<std::collections::HashSet<_>>();
    if ids.len() != input.ids.len()
        || ids.len() != current.len()
        || current.iter().any(|a| !ids.contains(&a.id))
    {
        return Err(AppError::Invalid(
            "Asset order must contain every owned asset exactly once".into(),
        ));
    }
    for (index, id) in input.ids.iter().enumerate() {
        tx.execute(
            "UPDATE material_asset SET sort_order=? WHERE id=?",
            params![index as f64, id],
        )?;
    }
    touch(tx, &input.material_id, now)
}
