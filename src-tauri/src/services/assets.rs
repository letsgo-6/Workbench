use crate::{
    db::Db,
    domain::{common::*, material::*},
    error::{AppError, AppResult},
    repo::{self, materials::AssetRecord},
};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

pub const IMAGE_LIMIT: u64 = 30 * 1024 * 1024;
pub const VIDEO_LIMIT: u64 = 300 * 1024 * 1024;
const DAY: u64 = 86400;
/// Encode a digest without adding an extra formatting dependency.
pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn invalid() -> AppError {
    AppError::Invalid("Unsupported file, signature mismatch, or size limit exceeded".into())
}

/// Validate extension and file signature before copying any input.
pub fn sniff(
    name: &str,
    head: &[u8],
    size: u64,
) -> AppResult<(&'static str, &'static str, &'static str)> {
    let ext = Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let (kind, mime, ext, valid) = match ext.as_str() {
        "png" => (
            "image",
            "image/png",
            "png",
            head.starts_with(b"\x89PNG\r\n\x1a\n"),
        ),
        "jpg" | "jpeg" => (
            "image",
            "image/jpeg",
            "jpg",
            head.starts_with(b"\xff\xd8\xff"),
        ),
        "webp" => (
            "image",
            "image/webp",
            "webp",
            head.starts_with(b"RIFF") && head.get(8..12) == Some(b"WEBP"),
        ),
        "gif" => (
            "gif",
            "image/gif",
            "gif",
            head.starts_with(b"GIF87a") || head.starts_with(b"GIF89a"),
        ),
        "mp4" => ("video", "video/mp4", "mp4", head.get(4..8) == Some(b"ftyp")),
        "webm" => (
            "video",
            "video/webm",
            "webm",
            head.starts_with(b"\x1a\x45\xdf\xa3"),
        ),
        _ => return Err(invalid()),
    };
    if !valid
        || size == 0
        || size
            > if kind == "video" {
                VIDEO_LIMIT
            } else {
                IMAGE_LIMIT
            }
    {
        return Err(invalid());
    }
    Ok((kind, mime, ext))
}

/// Allow only application-generated asset paths, never arbitrary paths from imported JSON.
pub fn valid_relative(name: &str) -> bool {
    let parts = name.split('/').collect::<Vec<_>>();
    let file = match parts.as_slice() {
        ["thumbs", file] if file.ends_with(".webp") => *file,
        [year, month, file]
            if year.len() == 4
                && year.bytes().all(|b| b.is_ascii_digit())
                && month.len() == 2
                && month.parse::<u32>().is_ok_and(|m| (1..=12).contains(&m)) =>
        {
            *file
        }
        _ => return false,
    };
    let Some((id, ext)) = file.rsplit_once('.') else {
        return false;
    };
    id.len() == 36
        && id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b) || b == b'-')
        && uuid::Uuid::parse_str(id).is_ok()
        && ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm"].contains(&ext)
}
/// Resolve owned paths while refusing existing symlink/reparse-point descendants.
pub fn owned_path(root: &Path, name: &str) -> AppResult<PathBuf> {
    if !valid_relative(name) {
        return Err(invalid());
    }
    let mut path = root.to_path_buf();
    reject_link(root)?;
    for part in name.split('/') {
        path.push(part);
        if let Ok(meta) = fs::symlink_metadata(&path) {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err(invalid());
                }
            }
            if meta.file_type().is_symlink() {
                return Err(invalid());
            }
        }
    }
    Ok(path)
}
fn reject_link(path: &Path) -> AppResult<()> {
    if let Ok(meta) = fs::symlink_metadata(path) {
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 {
                return Err(invalid());
            }
        }
        if meta.file_type().is_symlink() {
            return Err(invalid());
        }
    }
    Ok(())
}
/// Prevent exports from overwriting immutable media or the live database.
pub fn validate_export_target(paths: &crate::paths::AppPaths, target: &Path) -> AppResult<()> {
    let parent = target.parent().ok_or_else(invalid)?;
    fs::create_dir_all(parent)?;
    let resolved = if target.exists() {
        target.canonicalize()?
    } else {
        parent
            .canonicalize()?
            .join(target.file_name().ok_or_else(invalid)?)
    };
    if resolved.starts_with(paths.assets_dir.canonicalize()?)
        || resolved == paths.db_path.canonicalize()?
    {
        return Err(invalid());
    }
    Ok(())
}
/// Roll back all files owned by a failed import, including errors during commit.
#[derive(Default)]
pub struct PendingFiles {
    pub files: Vec<PathBuf>,
}
impl PendingFiles {
    pub fn keep(&mut self) {
        self.files.clear();
    }
}
impl Drop for PendingFiles {
    fn drop(&mut self) {
        for path in &self.files {
            let _ = fs::remove_file(path);
        }
    }
}

/// Copy a bounded stream to a temporary sibling, sync, then publish the complete file.
pub fn stage_reader(
    root: &Path,
    name: &str,
    reader: &mut impl Read,
    size: u64,
    now: i64,
    guard: &mut PendingFiles,
) -> AppResult<AssetRecord> {
    let mut head = vec![];
    reader.by_ref().take(16).read_to_end(&mut head)?;
    let (kind, mime, ext) = sniff(name, &head, size)?;
    let id = uuid::Uuid::now_v7().to_string();
    let date = chrono::DateTime::from_timestamp_millis(now).ok_or_else(invalid)?;
    let relative = format!("{}/{id}.{ext}", date.format("%Y/%m"));
    let target = owned_path(root, &relative)?;
    let parent = target.parent().ok_or_else(invalid)?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!("{id}.part"));
    guard.files.push(temporary.clone());
    let mut out = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    let mut hash = Sha256::new();
    hash.update(&head);
    out.write_all(&head)?;
    let mut count = head.len() as u64;
    let limit = if kind == "video" {
        VIDEO_LIMIT
    } else {
        IMAGE_LIMIT
    };
    let mut buf = [0u8; 64 * 1024];
    loop {
        let len = reader.read(&mut buf)?;
        if len == 0 {
            break;
        };
        count += len as u64;
        if count > limit {
            return Err(invalid());
        }
        hash.update(&buf[..len]);
        out.write_all(&buf[..len])?;
    }
    if count != size {
        return Err(invalid());
    }
    out.sync_all()?;
    drop(out);
    fs::rename(&temporary, &target)?;
    guard.files.push(target);
    Ok(AssetRecord {
        id,
        material_id: String::new(),
        media_kind: kind.into(),
        mime: mime.into(),
        file_name: relative,
        original_name: Path::new(name)
            .file_name()
            .and_then(|p| p.to_str())
            .unwrap_or("material")
            .into(),
        size_bytes: count,
        sha256: hex(hash.finalize().as_ref()),
        width: None,
        height: None,
        duration_ms: None,
        thumb_name: None,
        sort_order: 0.0,
        created_at: now,
    })
}
/// Hash files without allocating a buffer proportional to their size.
pub fn hash_file(path: &Path) -> AppResult<String> {
    let mut file = File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        };
        hash.update(&buffer[..n]);
    }
    Ok(hex(hash.finalize().as_ref()))
}
/// Validate ordinary metadata before a file import or text-only save.
pub fn validate_input(input: &mut MaterialInput) -> AppResult<()> {
    if input.kind.is_empty() {
        input.kind = "work".into();
    }
    if !["work", "component"].contains(&input.kind.as_str()) || input.title.chars().count() > 200 {
        return Err(invalid());
    }
    if input.tags.len() > 1000
        || input.tags.iter().any(|t| t.len() > 1048576)
        || [
            input.title.as_str(),
            input.note_md.as_str(),
            input.prompt.as_str(),
            input.url.as_deref().unwrap_or(""),
        ]
        .iter()
        .any(|s| s.len() > 1048576)
    {
        return Err(invalid());
    }
    if let Some(url) = input.url.as_deref().filter(|u| !u.is_empty()) {
        let parsed = reqwest::Url::parse(url).map_err(|_| invalid())?;
        if !["http", "https"].contains(&parsed.scheme()) {
            return Err(invalid());
        }
    }
    Ok(())
}
/// Commit all files as one import, returning the last new material for navigation.
pub fn import_files(
    db: &Db,
    root: &Path,
    input: &MaterialImportInput,
    now: i64,
) -> AppResult<MaterialImportResult> {
    if input.paths.is_empty() || input.paths.len() > 50 {
        return Err(invalid());
    }
    let mut files = PendingFiles::default();
    let mut records = vec![];
    for name in &input.paths {
        let meta = fs::symlink_metadata(name)?;
        if !meta.is_file() || meta.file_type().is_symlink() {
            return Err(invalid());
        }
        records.push(stage_reader(
            root,
            name,
            &mut File::open(name)?,
            meta.len(),
            now,
            &mut files,
        )?);
    }
    commit_staged(
        db,
        root,
        input.material_id.as_deref(),
        input.kind.as_deref(),
        records,
        now,
        &mut files,
    )
}
/// Share transactional insertion between native paths and raw clipboard requests.
pub fn commit_staged(
    db: &Db,
    root: &Path,
    material: Option<&str>,
    kind: Option<&str>,
    records: Vec<AssetRecord>,
    now: i64,
    files: &mut PendingFiles,
) -> AppResult<MaterialImportResult> {
    let mut metadata = MaterialInput {
        kind: kind.unwrap_or("work").into(),
        ..Default::default()
    };
    validate_input(&mut metadata)?;
    let mut kept = HashSet::new();
    let mut result = db.with_tx(|tx| {
        let mut last = material
            .map(|id| repo::materials::get(tx, id))
            .transpose()?;
        let mut added = 0;
        let mut skipped = 0;
        let mut touched = vec![];
        for a in &records {
            let parent = if let Some(id) = material {
                id.into()
            } else {
                metadata.title = Path::new(&a.original_name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .chars()
                    .take(200)
                    .collect();
                repo::materials::create(tx, &metadata, now, None)?.id
            };
            if repo::materials::add_asset(tx, &parent, a, now)? {
                added += 1;
                kept.insert(a.file_name.clone());
            } else {
                skipped += 1;
            }
            last = Some(repo::materials::get(tx, &parent)?);
            if !touched.contains(&parent) {
                touched.push(parent);
            }
        }
        let materials = touched
            .iter()
            .map(|id| repo::materials::get(tx, id))
            .collect::<AppResult<_>>()?;
        Ok(MaterialImportResult {
            material: last.ok_or_else(invalid)?,
            materials,
            added,
            skipped,
        })
    })?;
    for a in &records {
        if kept.contains(&a.file_name) {
            let path = owned_path(root, &a.file_name)?;
            files.files.retain(|p| p != &path);
        }
    }
    hydrate(root, &mut result.material)?;
    for item in &mut result.materials {
        hydrate(root, item)?;
    }
    Ok(result)
}
fn purged_path(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let original = owned_path(root, relative)?;
    let dir = if relative.starts_with("thumbs/") {
        root.join("_purged/thumbs")
    } else {
        root.join("_purged")
    };
    Ok(dir.join(original.file_name().ok_or_else(invalid)?))
}
fn recover_retained(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let original = owned_path(root, relative)?;
    if !original.exists() {
        let retained = purged_path(root, relative)?;
        if retained.is_file() {
            fs::create_dir_all(original.parent().ok_or_else(invalid)?)?;
            fs::rename(retained, &original)?;
        }
    }
    Ok(original)
}
/// Recover retained originals when restoring a database snapshot, otherwise mark missing.
pub fn hydrate(root: &Path, item: &mut Material) -> AppResult<()> {
    for asset in &mut item.assets {
        let relative = asset.path.clone();
        let original = recover_retained(root, &relative)?;
        asset.missing = !original.is_file();
        asset.path = original.to_string_lossy().into();
        if let Some(name) = asset.thumb_path.take() {
            let path = recover_retained(root, &name)?;
            if path.is_file() {
                asset.thumb_path = Some(path.to_string_lossy().into());
            }
        }
    }
    Ok(())
}
/// Move deleted originals and thumbnails into a fresh 30-day retention window.
pub fn retain_files(root: &Path, records: &[AssetRecord], now: i64) -> AppResult<()> {
    let at = SystemTime::UNIX_EPOCH + Duration::from_millis(now.max(0) as u64);
    for record in records {
        for name in std::iter::once(&record.file_name).chain(record.thumb_name.iter()) {
            let source = owned_path(root, name)?;
            if !source.is_file() {
                continue;
            }
            let target = purged_path(root, name)?;
            fs::create_dir_all(target.parent().ok_or_else(invalid)?)?;
            File::options()
                .write(true)
                .open(&source)?
                .set_modified(at)?;
            fs::rename(source, target)?;
        }
    }
    Ok(())
}
/// Remove metadata atomically, then retain the corresponding files after commit.
pub fn purge_entities(db: &Db, root: &Path, refs: &[EntityRef], now: i64) -> AppResult<()> {
    let files = db.with_tx(|tx| {
        let mut files = vec![];
        for r in refs {
            if r.entity_type == EntityType::Material {
                files.extend(repo::materials::asset_records(tx, Some(&r.id))?);
            }
            repo::common::mutate(tx, r, "purge", now, false)?;
        }
        Ok(files)
    })?;
    retain_files(root, &files, now)
}
/// Walk only regular application-owned files; symlinks never become copy sources.
pub fn walk(root: &Path) -> AppResult<Vec<PathBuf>> {
    reject_link(root)?;
    let mut result = vec![];
    if !root.exists() {
        return Ok(result);
    }
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let meta = fs::symlink_metadata(entry.path())?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 {
                return Err(invalid());
            }
        }
        if meta.file_type().is_symlink() {
            return Err(invalid());
        }
        if meta.is_dir() {
            result.extend(walk(&entry.path())?);
        } else if meta.is_file() {
            result.push(entry.path());
        }
    }
    Ok(result)
}
/// Clean retained files only after 30 days; quarantine old unreferenced files after seven.
pub fn maintenance(db: &Db, root: &Path, now: i64) -> AppResult<()> {
    let refs = db
        .with_conn(repo::trash::list)?
        .into_iter()
        .filter(|i| i.deleted_at < now - 30 * DAY as i64 * 1000)
        .map(|i| i.r#ref)
        .collect::<Vec<_>>();
    purge_entities(db, root, &refs, now)?;
    let records = db.with_conn(|c| repo::materials::asset_records(c, None))?;
    let referenced = records
        .iter()
        .flat_map(|a| std::iter::once(a.file_name.clone()).chain(a.thumb_name.clone()))
        .collect::<HashSet<_>>();
    // A restored daily snapshot can reference retained files before any drawer is opened.
    for relative in &referenced {
        recover_retained(root, relative)?;
    }
    for file in walk(root)? {
        let relative = file
            .strip_prefix(root)
            .map_err(|_| invalid())?
            .to_string_lossy()
            .replace('\\', "/");
        let modified = fs::metadata(&file)?
            .modified()?
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        if relative.starts_with("_purged/") {
            if modified < now - 30 * DAY as i64 * 1000 {
                fs::remove_file(file)?;
            }
        } else if !referenced.contains(&relative) && modified < now - 7 * DAY as i64 * 1000 {
            let target = if valid_relative(&relative) {
                purged_path(root, &relative)?
            } else {
                root.join("_purged/orphans")
                    .join(uuid::Uuid::now_v7().to_string())
            };
            fs::create_dir_all(target.parent().ok_or_else(invalid)?)?;
            File::options()
                .write(true)
                .open(&file)?
                .set_modified(SystemTime::UNIX_EPOCH + Duration::from_millis(now.max(0) as u64))?;
            fs::rename(file, target)?;
        }
    }
    Ok(())
}

/// Save a small, verified thumbnail before attaching its metadata; never mutate originals.
pub struct ThumbnailInfo {
    pub width: u32,
    pub height: u32,
    pub duration_ms: Option<u32>,
}
pub fn set_thumbnail(
    db: &Db,
    root: &Path,
    id: &str,
    bytes: &[u8],
    info: ThumbnailInfo,
    now: i64,
) -> AppResult<MaterialAsset> {
    let ThumbnailInfo {
        width,
        height,
        duration_ms: duration,
    } = info;
    if width == 0
        || height == 0
        || width > 100000
        || height > 100000
        || bytes.len() > 2 * 1024 * 1024
    {
        return Err(invalid());
    }
    sniff("thumb.webp", bytes, bytes.len() as u64)?;
    let record = db
        .with_conn(|c| repo::materials::asset_records(c, None))?
        .into_iter()
        .find(|a| a.id == id)
        .ok_or(AppError::NotFound)?;
    let relative = format!("thumbs/{id}.webp");
    let target = owned_path(root, &relative)?;
    let mut files = PendingFiles::default();
    if !target.exists() {
        let staged = stage_reader(
            root,
            "thumb.webp",
            &mut std::io::Cursor::new(bytes),
            bytes.len() as u64,
            now,
            &mut files,
        )?;
        fs::create_dir_all(target.parent().ok_or_else(invalid)?)?;
        fs::rename(owned_path(root, &staged.file_name)?, &target)?;
        files.files.push(target.clone());
    } else {
        let mut head = vec![];
        File::open(&target)?.take(16).read_to_end(&mut head)?;
        sniff("thumb.webp", &head, fs::metadata(&target)?.len())?;
    }
    db.with_tx(|tx| {
        repo::materials::check_asset(tx, &record.material_id, id)?;
        tx.execute(
            "UPDATE material_asset SET thumb_name=?,width=?,height=?,duration_ms=? WHERE id=?",
            rusqlite::params![relative, width, height, duration, id],
        )?;
        Ok(())
    })?;
    files.keep();
    let mut material = db.with_conn(|c| repo::materials::get(c, &record.material_id))?;
    hydrate(root, &mut material)?;
    material
        .assets
        .into_iter()
        .find(|a| a.id == id)
        .ok_or(AppError::NotFound)
}
/// Delete one asset's metadata before moving its files to retained storage.
pub fn delete_asset(db: &Db, root: &Path, id: &str, now: i64) -> AppResult<()> {
    let record = db.with_tx(|tx| {
        let record = repo::materials::asset_records(tx, None)?
            .into_iter()
            .find(|a| a.id == id)
            .ok_or(AppError::NotFound)?;
        repo::materials::check_asset(tx, &record.material_id, id)?;
        tx.execute(
            "UPDATE material SET cover_asset_id=NULL WHERE cover_asset_id=?",
            [id],
        )?;
        tx.execute("DELETE FROM material_asset WHERE id=?", [id])?;
        repo::materials::touch(tx, &record.material_id, now)?;
        Ok(record)
    })?;
    retain_files(root, &[record], now)
}
/// Remove only a still-empty draft; late file imports cannot be purged by a stale UI check.
pub fn discard_empty(db: &Db, id: &str, now: i64) -> AppResult<bool> {
    db.with_tx(|tx|{
        let blank:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM material m WHERE id=? AND trim(title)='' AND coalesce(trim(url),'')='' AND trim(note_md)='' AND trim(prompt)='' AND NOT EXISTS(SELECT 1 FROM material_asset WHERE material_id=m.id) AND NOT EXISTS(SELECT 1 FROM entity_tag WHERE entity_type='material' AND entity_id=m.id))",[id],|r|r.get(0))?;
        if blank {repo::common::mutate(tx,&EntityRef{entity_type:EntityType::Material,id:id.into()},"purge",now,false)?;}Ok(blank)
    })
}
/// Count on-disk storage, including separately retained deleted files.
pub fn usage(root: &Path) -> AppResult<AssetsUsage> {
    let mut result = AssetsUsage::default();
    for file in walk(root)? {
        let bytes = fs::metadata(&file)?.len();
        if file.starts_with(root.join("_purged")) {
            result.purged_bytes += bytes;
        } else {
            result.file_count += 1;
            result.total_bytes += bytes;
        }
    }
    Ok(result)
}
/// Copy and verify every file before atomically switching the selected data directory.
pub fn change_directory(db: &Db, paths: &crate::paths::AppPaths, target: &Path) -> AppResult<()> {
    fs::create_dir_all(target)?;
    let target = target.canonicalize()?;
    let source = paths.data_dir.canonicalize()?;
    if target == source
        || target.starts_with(&source)
        || target.join("workbench.db").exists()
        || target.join("assets").exists()
    {
        return Err(invalid());
    }
    let stage = target.join(format!("assets-stage-{}", uuid::Uuid::now_v7()));
    fs::create_dir(&stage)?;
    let mut new_files = PendingFiles::default();
    let result = (|| {
        let sources = walk(&paths.assets_dir)?;
        for file in &sources {
            let relative = file
                .strip_prefix(&paths.assets_dir)
                .map_err(|_| invalid())?;
            let to = stage.join(relative);
            fs::create_dir_all(to.parent().ok_or_else(invalid)?)?;
            new_files.files.push(to.clone());
            fs::copy(file, &to)?;
            if hash_file(file)? != hash_file(&to)? {
                return Err(invalid());
            }
        }
        if sources.len() != walk(&stage)?.len() {
            return Err(invalid());
        }
        let db_path = target.join("workbench.db");
        new_files.files.push(db_path.clone());
        super::data::snapshot(db, &db_path)?;
        fs::rename(&stage, target.join("assets"))?;
        for file in walk(&target.join("assets"))? {
            new_files.files.push(file);
        }
        paths.set_data_dir(target.clone())?;
        new_files.keep();
        Ok(())
    })();
    // Only empty, freshly created directories are removed; user-owned data is never deleted.
    if result.is_err() {
        drop(new_files);
        let _ = remove_empty(&stage);
        let _ = remove_empty(&target.join("assets"));
    }
    result
}
fn remove_empty(dir: &Path) -> std::io::Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            remove_empty(&entry.path())?;
        }
    }
    fs::remove_dir(dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn signatures_extensions_and_limits() {
        for (name, bytes, kind) in [
            ("a.png", &b"\x89PNG\r\n\x1a\n"[..], "image"),
            ("a.JPG", &b"\xff\xd8\xff"[..], "image"),
            ("a.webp", &b"RIFF1234WEBP"[..], "image"),
            ("a.gif", &b"GIF89a"[..], "gif"),
            ("a.mp4", &b"\0\0\0\x18ftypisom"[..], "video"),
            ("a.webm", &b"\x1a\x45\xdf\xa3"[..], "video"),
        ] {
            assert_eq!(sniff(name, bytes, bytes.len() as u64).unwrap().0, kind);
            assert!(sniff(name, bytes, 301 * 1024 * 1024).is_err());
            assert!(sniff(name, b"fake", 4).is_err());
        }
        assert!(sniff("a.svg", b"<svg/>", 6).is_err());
        assert!(sniff("a.png", b"\xff\xd8\xff", 3).is_err());
        assert!(sniff("a.png", b"\x89PNG\r\n\x1a\n", 31 * 1024 * 1024).is_err());
    }
}
