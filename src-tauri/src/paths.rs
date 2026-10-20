use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Bootstrap {
    data_dir: PathBuf,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pending_restore: Option<String>,
}
#[derive(Clone)]
pub struct AppPaths {
    pub config_dir: PathBuf,
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub backups_dir: PathBuf,
}
impl AppPaths {
    /// Resolve bootstrap before opening the database.
    pub fn resolve(config: PathBuf, default_data: PathBuf) -> AppResult<Self> {
        std::fs::create_dir_all(&config)?;
        let file = config.join("bootstrap.json");
        let mut bootstrap = if file.exists() {
            serde_json::from_slice::<Bootstrap>(&std::fs::read(&file)?)?
        } else {
            let bootstrap = Bootstrap {
                data_dir: default_data,
                pending_restore: None,
            };
            std::fs::write(&file, serde_json::to_vec_pretty(&bootstrap)?)?;
            bootstrap
        };
        let data_dir = bootstrap.data_dir.clone();
        let backups_dir = data_dir.join("backups");
        std::fs::create_dir_all(&backups_dir)?;
        if let Some(name) = bootstrap.pending_restore.as_deref() {
            if !crate::services::backups::valid_name(name) {
                return Err(crate::error::AppError::Invalid(
                    "Invalid pending backup name".into(),
                ));
            }
            let source = backups_dir.join(name);
            crate::services::backups::validate(&source)?;
            let target = data_dir.join("workbench.db");
            if target.exists() {
                let conn = rusqlite::Connection::open(&target)?;
                conn.execute_batch("PRAGMA wal_checkpoint(FULL)")?;
                conn.execute(
                    "VACUUM INTO ?",
                    [backups_dir
                        .join(format!("pre-restore-{}.db", uuid::Uuid::now_v7()))
                        .to_string_lossy()
                        .as_ref()],
                )?;
            }
            let stage = data_dir.join("restore-ready.db");
            std::fs::copy(source, &stage)?;
            crate::services::backups::validate(&stage)?;
            for suffix in ["-wal", "-shm"] {
                let sidecar = data_dir.join(format!("workbench.db{suffix}"));
                if sidecar.exists() {
                    std::fs::remove_file(sidecar)?;
                }
            }
            std::fs::rename(stage, target)?;
            bootstrap.pending_restore = None;
            let temp = config.join("bootstrap.new.json");
            std::fs::write(&temp, serde_json::to_vec_pretty(&bootstrap)?)?;
            std::fs::rename(temp, &file)?;
        }
        Ok(Self {
            config_dir: config,
            db_path: data_dir.join("workbench.db"),
            data_dir,
            backups_dir,
        })
    }
    /// Persist only the selected directory using a temporary file.
    pub fn set_data_dir(&self, path: PathBuf) -> AppResult<()> {
        let temp = self.config_dir.join("bootstrap.new.json");
        std::fs::write(
            &temp,
            serde_json::to_vec_pretty(&Bootstrap {
                data_dir: path,
                pending_restore: None,
            })?,
        )?;
        std::fs::rename(temp, self.config_dir.join("bootstrap.json"))?;
        Ok(())
    }
    /// Queue a validated owned backup; startup performs replacement before opening Db.
    pub fn queue_restore(&self, name: &str) -> AppResult<()> {
        if !crate::services::backups::valid_name(name) {
            return Err(crate::error::AppError::Invalid(
                "Invalid backup name".into(),
            ));
        }
        crate::services::backups::validate(&self.backups_dir.join(name))?;
        let temp = self.config_dir.join("bootstrap.new.json");
        std::fs::write(
            &temp,
            serde_json::to_vec_pretty(&Bootstrap {
                data_dir: self.data_dir.clone(),
                pending_restore: Some(name.into()),
            })?,
        )?;
        std::fs::rename(temp, self.config_dir.join("bootstrap.json"))?;
        Ok(())
    }
}
