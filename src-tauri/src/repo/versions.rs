use crate::{
    domain::{history::PromptVersion, prompt::Prompt},
    error::{AppError, AppResult},
};
use rusqlite::{Connection, Transaction, params};
/// List snapshots newest first, including their original source for comparison.
pub fn list(conn: &Connection, id: &str) -> AppResult<Vec<PromptVersion>> {
    super::prompts::get(conn, id)?;
    Ok(conn.prepare("SELECT id,prompt_id,title,body,system_prompt,created_at FROM prompt_version WHERE prompt_id=? ORDER BY created_at DESC,id DESC")?
        .query_map([id], |r| Ok(PromptVersion { id:r.get(0)?,prompt_id:r.get(1)?,title:r.get(2)?,body:r.get(3)?,system_prompt:r.get(4)?,created_at:r.get(5)? }))?.collect::<Result<Vec<_>,_>>()?)
}
/// Save only changed source at a session boundary, retaining the latest fifty snapshots.
pub fn create(
    tx: &Transaction<'_>,
    id: &str,
    now: i64,
    force: bool,
) -> AppResult<Option<PromptVersion>> {
    let p = super::prompts::get(tx, id)?;
    let latest = list(tx, id)?.into_iter().next();
    if !force && latest.is_some_and(|v| v.body == p.body && v.system_prompt == p.system_prompt) {
        return Ok(None);
    }
    let version = PromptVersion {
        id: uuid::Uuid::now_v7().to_string(),
        prompt_id: id.into(),
        title: p.title,
        body: p.body,
        system_prompt: p.system_prompt,
        created_at: now,
    };
    tx.execute("INSERT INTO prompt_version(id,prompt_id,title,body,system_prompt,created_at) VALUES (?,?,?,?,?,?)",params![version.id,id,version.title,version.body,version.system_prompt,now])?;
    tx.execute("DELETE FROM prompt_version WHERE prompt_id=? AND id NOT IN (SELECT id FROM prompt_version WHERE prompt_id=? ORDER BY created_at DESC,id DESC LIMIT 50)",params![id,id])?;
    Ok(Some(version))
}
/// Preserve current source, restore the chosen snapshot, then record the restoration itself.
pub fn restore(tx: &Transaction<'_>, version: &str, now: i64) -> AppResult<Prompt> {
    let row: Option<PromptVersion> = {
        use rusqlite::OptionalExtension;
        tx.query_row("SELECT id,prompt_id,title,body,system_prompt,created_at FROM prompt_version WHERE id=?",[version],|r| Ok(PromptVersion { id:r.get(0)?,prompt_id:r.get(1)?,title:r.get(2)?,body:r.get(3)?,system_prompt:r.get(4)?,created_at:r.get(5)? })).optional()?
    };
    let v = row.ok_or(AppError::NotFound)?;
    create(tx, &v.prompt_id, now, false)?;
    tx.execute("UPDATE prompt SET title=?,body=?,system_prompt=?,variables=?,updated_at=? WHERE id=? AND deleted_at IS NULL",params![v.title,v.body,v.system_prompt,serde_json::to_string(&crate::services::template::variables(&v.body))?,now,v.prompt_id])?;
    super::search::upsert(
        tx,
        &crate::domain::common::EntityRef {
            entity_type: crate::domain::common::EntityType::Prompt,
            id: v.prompt_id.clone(),
        },
    )?;
    create(tx, &v.prompt_id, now + 1, true)?;
    super::prompts::get(tx, &v.prompt_id)
}
