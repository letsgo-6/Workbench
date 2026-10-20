use crate::{
    db::Db,
    domain::backup::BackupInfo,
    error::{AppError, AppResult},
};
use std::path::Path;
/// Restrict restore and retention to application-owned daily snapshots.
pub fn valid_name(name: &str) -> bool {
    name.strip_prefix("workbench-")
        .and_then(|n| n.strip_suffix(".db"))
        .is_some_and(|date| {
            date.len() == 8 && chrono::NaiveDate::parse_from_str(date, "%Y%m%d").is_ok()
        })
}
/// List daily snapshots, leaving pre-import and recovery copies outside retention.
pub fn list(dir: &Path) -> AppResult<Vec<BackupInfo>> {
    let mut result = vec![];
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if valid_name(&name) && entry.file_type()?.is_file() {
            result.push(BackupInfo {
                name,
                bytes: entry.metadata()?.len(),
            });
        }
    }
    result.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(result)
}
/// Replace today's snapshot only after VACUUM succeeds, then retain seven days.
pub fn now(db: &Db, dir: &Path, today: &str, refresh: bool) -> AppResult<BackupInfo> {
    let date = chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d")
        .map_err(|_| AppError::Invalid("Invalid backup day".into()))?;
    let name = format!("workbench-{}.db", date.format("%Y%m%d"));
    let target = dir.join(&name);
    if refresh || !target.exists() {
        let stage = dir.join(format!("snapshot-{}.tmp", uuid::Uuid::now_v7()));
        super::data::snapshot(db, &stage)?;
        if let Err(e) = std::fs::rename(&stage, &target) {
            let _ = std::fs::remove_file(stage);
            return Err(e.into());
        }
    }
    for old in list(dir)?.into_iter().skip(7) {
        std::fs::remove_file(dir.join(old.name))?;
    }
    Ok(BackupInfo {
        name,
        bytes: std::fs::metadata(target)?.len(),
    })
}
/// Validate a standalone snapshot before it is scheduled or installed.
pub fn validate(path: &Path) -> AppResult<()> {
    let conn =
        rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let check: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
    let version: u32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    let tables:u32=conn.query_row("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('idea','todo','tip','skill','prompt','tag','entity_tag','ai_provider','setting','prompt_version','ai_conversation','ai_message')",[],|r|r.get(0))?;
    let foreign_key_errors: u32 =
        conn.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| {
            r.get(0)
        })?;
    if check != "ok"
        || !(1..=2).contains(&version)
        || tables != if version == 1 { 9 } else { 12 }
        || foreign_key_errors != 0
    {
        return Err(AppError::Invalid("Invalid database backup".into()));
    }
    Ok(())
}
