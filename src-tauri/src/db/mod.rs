pub mod migrate;
use crate::error::AppResult;
use parking_lot::Mutex;
use rusqlite::{Connection, Transaction};
use std::{path::Path, sync::Arc};

/// Single SQLite connection; transactions never cross await points.
#[derive(Clone)]
pub struct Db(Arc<Mutex<Connection>>);
impl Db {
    /// Open and migrate a WAL database, preserving a backup on migration failure.
    pub fn open(path: &Path, backups: &Path) -> AppResult<Self> {
        let mut conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")?;
        if let Err(error) = migrate::run(&mut conn) {
            conn.execute_batch("PRAGMA wal_checkpoint(FULL);")?;
            std::fs::copy(
                path,
                backups.join(format!(
                    "pre-migrate-{}.db",
                    chrono::Utc::now().timestamp_millis()
                )),
            )?;
            return Err(error);
        }
        Ok(Self(Arc::new(Mutex::new(conn))))
    }
    /// Execute a read while holding the connection lock.
    pub fn with_conn<T>(&self, f: impl FnOnce(&Connection) -> AppResult<T>) -> AppResult<T> {
        f(&self.0.lock())
    }
    /// Commit all changes together, or roll them all back on error.
    pub fn with_tx<T>(&self, f: impl FnOnce(&Transaction<'_>) -> AppResult<T>) -> AppResult<T> {
        let mut guard = self.0.lock();
        let tx = guard.transaction()?;
        let result = f(&tx)?;
        tx.commit()?;
        Ok(result)
    }
}
