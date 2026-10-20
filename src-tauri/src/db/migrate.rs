use crate::error::{AppError, AppResult};
use rusqlite::Connection;
const MIGRATIONS: [&str; 2] = [
    include_str!("../../migrations/0001_init.sql"),
    include_str!("../../migrations/0002_v02.sql"),
];
/// Apply only unapplied migrations, atomically.
pub fn run(conn: &mut Connection) -> AppResult<()> {
    let version: u32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version as usize > MIGRATIONS.len() {
        return Err(AppError::Invalid(
            "Database schema is newer than this application".into(),
        ));
    }
    let tx = conn.transaction()?;
    for sql in MIGRATIONS.iter().skip(version as usize) {
        tx.execute_batch(sql)?;
    }
    tx.pragma_update(None, "user_version", MIGRATIONS.len() as u32)?;
    tx.commit()?;
    Ok(())
}
