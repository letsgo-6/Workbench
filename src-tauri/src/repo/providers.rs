use crate::{
    domain::provider::*,
    error::{AppError, AppResult},
};
use rusqlite::{Connection, OptionalExtension, Transaction, params};

fn map(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProviderView> {
    Ok(ProviderView {
        id: row.get("id")?,
        name: row.get("name")?,
        base_url: row.get("base_url")?,
        model: row.get("model")?,
        temperature: row.get("temperature")?,
        max_tokens: row.get("max_tokens")?,
        is_default: row.get("is_default")?,
        has_key: false,
        key_hint: None,
    })
}
/// Return configuration only; credentials are deliberately absent from SQL.
pub fn list(conn: &Connection) -> AppResult<Vec<ProviderView>> {
    Ok(conn
        .prepare("SELECT * FROM ai_provider ORDER BY is_default DESC,sort_order,created_at")?
        .query_map([], map)?
        .collect::<Result<Vec<_>, _>>()?)
}
/// Read one configured provider or the default.
pub fn get(conn: &Connection, id: Option<&str>) -> AppResult<ProviderView> {
    let result = if let Some(id) = id {
        conn.query_row("SELECT * FROM ai_provider WHERE id=?", [id], map)
            .optional()?
    } else {
        conn.query_row("SELECT * FROM ai_provider WHERE is_default=1", [], map)
            .optional()?
    };
    result.ok_or_else(|| {
        AppError::coded(
            crate::error::ErrorCode::AiNoProvider,
            "No AI provider configured",
        )
    })
}
/// Upsert public configuration; a new first provider becomes the default.
pub fn save(
    tx: &Transaction<'_>,
    id: &str,
    input: &ProviderInput,
    now: i64,
) -> AppResult<ProviderView> {
    tx.execute("INSERT INTO ai_provider(id,name,base_url,model,temperature,max_tokens,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,NOT EXISTS(SELECT 1 FROM ai_provider),?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,model=excluded.model,temperature=excluded.temperature,max_tokens=excluded.max_tokens,updated_at=excluded.updated_at",params![id,input.name,input.base_url.trim_end_matches('/'),input.model,input.temperature,input.max_tokens,now,now])?;
    get(tx, Some(id))
}
/// Select exactly one default provider.
pub fn set_default(tx: &Transaction<'_>, id: &str) -> AppResult<()> {
    get(tx, Some(id))?;
    tx.execute("UPDATE ai_provider SET is_default=(id=?)", [id])?;
    Ok(())
}
/// Delete configuration, electing a replacement when necessary.
pub fn delete(tx: &Transaction<'_>, id: &str) -> AppResult<()> {
    get(tx, Some(id))?;
    tx.execute("DELETE FROM ai_provider WHERE id=?", [id])?;
    tx.execute("UPDATE ai_provider SET is_default=1 WHERE id=(SELECT id FROM ai_provider ORDER BY sort_order,created_at LIMIT 1) AND NOT EXISTS(SELECT 1 FROM ai_provider WHERE is_default=1)",[])?;
    Ok(())
}
