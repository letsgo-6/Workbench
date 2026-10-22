use crate::error::{AppError, AppResult};
use rusqlite::Connection;
const MIGRATIONS: [&str; 3] = [
    include_str!("../../migrations/0001_init.sql"),
    include_str!("../../migrations/0002_v02.sql"),
    include_str!("../../migrations/0003_materials.sql"),
];
/// Apply only unapplied migrations, atomically.
pub fn run(conn: &mut Connection) -> AppResult<()> {
    run_migrations(conn, &MIGRATIONS)
}
#[cfg(test)]
pub fn legacy_v2(conn: &mut Connection) -> AppResult<()> {
    run_migrations(conn, &MIGRATIONS[..2])
}
fn run_migrations(conn: &mut Connection, migrations: &[&str]) -> AppResult<()> {
    let version: u32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version as usize > migrations.len() {
        return Err(AppError::Invalid(
            "Database schema is newer than this application".into(),
        ));
    }
    let tx = conn.transaction()?;
    for sql in migrations.iter().skip(version as usize) {
        tx.execute_batch(sql)?;
    }
    tx.pragma_update(None, "user_version", migrations.len() as u32)?;
    tx.commit()?;
    Ok(())
}
