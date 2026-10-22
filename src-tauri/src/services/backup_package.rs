use crate::{
    db::Db,
    domain::data::ImportReport,
    error::{AppError, AppResult, ErrorCode},
    paths::AppPaths,
    repo,
    services::{
        assets::{self, PendingFiles},
        data,
        secrets::SecretStore,
    },
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs::{self, File},
    io::{Read, Write},
    path::Path,
};
use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};
const TOTAL_LIMIT: u64 = 10 * 1024 * 1024 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    app: String,
    format_version: u32,
    schema_version: u32,
    exported_at: i64,
    asset_count: usize,
    total_bytes: u64,
}
fn invalid() -> AppError {
    AppError::coded(
        ErrorCode::ImportInvalid,
        "Invalid, unsafe or damaged full backup",
    )
}
fn zip_error(_: zip::result::ZipError) -> AppError {
    invalid()
}

/// Write only referenced files, with per-file hashes, to a complete atomic backup package.
pub fn export(db: &Db, root: &Path, target: &Path) -> AppResult<()> {
    let (mut backup, records) =
        db.with_conn(|c| Ok((data::export(c)?, repo::materials::asset_records(c, None)?)))?;
    let mut hashes = BTreeMap::new();
    let mut total = 0u64;
    for a in &records {
        for name in std::iter::once(&a.file_name).chain(a.thumb_name.iter()) {
            let file = assets::owned_path(root, name)?;
            if !file.is_file() {
                return Err(AppError::Invalid(
                    "Missing material file; use data-only export to preserve metadata".into(),
                ));
            }
            let size = fs::metadata(&file)?.len();
            let mut head = vec![];
            File::open(&file)?.take(16).read_to_end(&mut head)?;
            assets::sniff(name, &head, size).map_err(|_| invalid())?;
            let hash = assets::hash_file(&file)?;
            if name == &a.file_name && (hash != a.sha256 || size != a.size_bytes) {
                return Err(invalid());
            }
            if hashes.insert(name.clone(), hash).is_none() {
                total = entry_budget(&format!("assets/{name}"), size, size, total)?;
            }
        }
    }
    if hashes.len() > 50000 {
        return Err(invalid());
    }
    let manifest = Manifest {
        app: "workbench".into(),
        format_version: 2,
        schema_version: 3,
        exported_at: backup.exported_at,
        asset_count: records.len(),
        total_bytes: total,
    };
    backup.asset_hashes = Some(hashes.clone());
    let parent = target.parent().ok_or_else(invalid)?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!("backup-{}.part", uuid::Uuid::now_v7()));
    let mut guard = PendingFiles {
        files: vec![temporary.clone()],
    };
    let output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    let mut zip = ZipWriter::new(output);
    // Already-compressed media gains little from deflate; stored entries also avoid creating
    // a highly compressible legitimate backup that its own bomb detector would reject.
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (name, bytes) in [
        ("manifest.json", serde_json::to_vec(&manifest)?),
        ("data.json", serde_json::to_vec(&backup)?),
    ] {
        total = entry_budget(name, bytes.len() as u64, bytes.len() as u64, total)?;
        zip.start_file(name, options).map_err(zip_error)?;
        zip.write_all(&bytes)?;
    }
    for name in hashes.keys() {
        zip.start_file(format!("assets/{name}"), options)
            .map_err(zip_error)?;
        std::io::copy(&mut File::open(assets::owned_path(root, name)?)?, &mut zip)?;
    }
    let file = zip.finish().map_err(zip_error)?;
    file.sync_all()?;
    drop(file);
    fs::rename(temporary, target)?;
    guard.keep();
    Ok(())
}
fn limit(name: &str) -> u64 {
    match name {
        "manifest.json" => 64 * 1024,
        "data.json" => 50_000_000,
        _ if name.starts_with("assets/thumbs/") => 2 * 1024 * 1024,
        _ if name.ends_with(".mp4") || name.ends_with(".webm") => assets::VIDEO_LIMIT,
        _ => assets::IMAGE_LIMIT,
    }
}
fn entry_budget(name: &str, size: u64, compressed: u64, total: u64) -> AppResult<u64> {
    if size > limit(name) || size > compressed.max(1).saturating_mul(200) {
        return Err(invalid());
    }
    let total = total.checked_add(size).ok_or_else(invalid)?;
    if total > TOTAL_LIMIT {
        return Err(invalid());
    }
    Ok(total)
}
fn read_small<R: Read>(reader: &mut R, limit: u64) -> AppResult<Vec<u8>> {
    let mut bytes = vec![];
    reader.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(invalid());
    }
    Ok(bytes)
}
fn write_asset<R: Read>(
    root: &Path,
    name: &str,
    source: &mut R,
    size: u64,
    hash: &str,
    guard: &mut PendingFiles,
) -> AppResult<()> {
    let target = assets::owned_path(root, name)?;
    let exists = target.exists();
    if exists && (!target.is_file() || assets::hash_file(&target)? != hash) {
        return Err(invalid());
    }
    let parent = target.parent().ok_or_else(invalid)?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!("{}.part", uuid::Uuid::now_v7()));
    let mut output = if exists {
        None
    } else {
        guard.files.push(temporary.clone());
        Some(
            fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)?,
        )
    };
    let mut head = vec![];
    source.by_ref().take(16).read_to_end(&mut head)?;
    assets::sniff(name, &head, size).map_err(|_| invalid())?;
    let mut hasher = Sha256::new();
    hasher.update(&head);
    if let Some(out) = &mut output {
        out.write_all(&head)?;
    }
    let mut count = head.len() as u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let n = source.read(&mut buffer).map_err(|_| invalid())?;
        if n == 0 {
            break;
        }
        count += n as u64;
        if count > size || count > limit(&format!("assets/{name}")) {
            return Err(invalid());
        }
        hasher.update(&buffer[..n]);
        if let Some(out) = &mut output {
            out.write_all(&buffer[..n])?;
        }
    }
    if count != size || assets::hex(hasher.finalize().as_ref()) != hash {
        return Err(invalid());
    }
    if let Some(out) = output {
        out.sync_all()?;
        drop(out);
        fs::rename(&temporary, &target)?;
        guard.files.push(target);
    }
    Ok(())
}
/// Validate the entire archive before credentials or rows change, publishing files before SQL.
pub fn import(
    db: &Db,
    secrets: &SecretStore,
    paths: &AppPaths,
    path: &Path,
    mode: &str,
) -> AppResult<ImportReport> {
    if !["merge", "overwrite"].contains(&mode) {
        return Err(invalid());
    }
    let mut archive = ZipArchive::new(File::open(path)?).map_err(zip_error)?;
    if archive.len() > 50002 {
        return Err(invalid());
    }
    let mut entries = HashSet::new();
    let mut total = 0u64;
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(zip_error)?;
        let decoded = file.name().map_err(zip_error)?;
        let name = decoded.as_ref();
        if !entries.insert(name.to_string())
            || file.is_dir()
            || file.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
            || (!["manifest.json", "data.json"].contains(&name)
                && !name
                    .strip_prefix("assets/")
                    .is_some_and(assets::valid_relative))
        {
            return Err(invalid());
        }
        total = entry_budget(name, file.size(), file.compressed_size(), total)?;
    }
    let manifest: Manifest = serde_json::from_slice(&read_small(
        &mut archive.by_name("manifest.json").map_err(zip_error)?,
        64 * 1024,
    )?)
    .map_err(|_| invalid())?;
    if manifest.app != "workbench"
        || manifest.format_version != 2
        || manifest.schema_version != 3
        || manifest.total_bytes > TOTAL_LIMIT
    {
        return Err(invalid());
    }
    let json = read_small(
        &mut archive.by_name("data.json").map_err(zip_error)?,
        50_000_000,
    )?;
    let backup = db.with_conn(|c| data::decode(c, &json))?;
    if backup.schema_version != 3 {
        return Err(invalid());
    }
    let hashes = backup.asset_hashes.as_ref().ok_or_else(invalid)?;
    let records = backup.data["materialAssets"]
        .as_array()
        .ok_or_else(invalid)?;
    if manifest.asset_count != records.len() || archive.len() != hashes.len() + 2 {
        return Err(invalid());
    }
    let mut expected = HashSet::new();
    for record in records {
        let name = record["file_name"].as_str().ok_or_else(invalid)?;
        let hash = record["sha256"].as_str().ok_or_else(invalid)?;
        if hashes.get(name).map(String::as_str) != Some(hash) {
            return Err(invalid());
        }
        expected.insert(name.to_string());
        if let Some(thumb) = record["thumb_name"].as_str() {
            expected.insert(thumb.to_string());
        }
    }
    if expected.len() != hashes.len()
        || hashes
            .keys()
            .any(|n| !expected.contains(n) || !assets::valid_relative(n))
    {
        return Err(invalid());
    }
    let mut files = PendingFiles::default();
    let mut asset_bytes = 0u64;
    for (name, hash) in hashes {
        let mut file = archive
            .by_name(&format!("assets/{name}"))
            .map_err(zip_error)?;
        asset_bytes = asset_bytes.checked_add(file.size()).ok_or_else(invalid)?;
        if asset_bytes > TOTAL_LIMIT {
            return Err(invalid());
        }
        if let Some(row) = records
            .iter()
            .find(|r| r["file_name"].as_str() == Some(name))
            && row["size_bytes"].as_u64() != Some(file.size())
        {
            return Err(invalid());
        }
        let size = file.size();
        write_asset(&paths.assets_dir, name, &mut file, size, hash, &mut files)?;
    }
    if asset_bytes != manifest.total_bytes {
        return Err(invalid());
    }
    let staging = paths
        .backups_dir
        .join(format!("import-stage-{}.json", uuid::Uuid::now_v7()));
    let _json_guard = PendingFiles {
        files: vec![staging.clone()],
    };
    fs::write(&staging, &json)?;
    let result = data::import(db, secrets, &paths.backups_dir, &staging, mode)?;
    let referenced = db
        .with_conn(|c| repo::materials::asset_records(c, None))?
        .into_iter()
        .flat_map(|a| std::iter::once(a.file_name).chain(a.thumb_name))
        .map(|n| assets::owned_path(&paths.assets_dir, &n))
        .collect::<AppResult<HashSet<_>>>()?;
    files.files.retain(|path| !referenced.contains(path));
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quota_includes_metadata_and_rejects_oversized_entries_and_bombs() {
        assert!(entry_budget("data.json", 1, 1, TOTAL_LIMIT).is_err());
        assert!(
            entry_budget(
                "assets/a.png",
                assets::IMAGE_LIMIT + 1,
                assets::IMAGE_LIMIT + 1,
                0
            )
            .is_err()
        );
        assert!(entry_budget("data.json", 1_000_000, 100, 0).is_err());
        assert_eq!(
            entry_budget("data.json", 1, 1, TOTAL_LIMIT - 1).unwrap(),
            TOTAL_LIMIT
        );
    }
}
