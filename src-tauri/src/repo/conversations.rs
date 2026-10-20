use crate::{
    domain::{common::EntityRef, history::*},
    error::{AppError, AppResult},
};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
fn map(r: &rusqlite::Row<'_>) -> rusqlite::Result<Conversation> {
    Ok(Conversation {
        id: r.get("id")?,
        title: r.get("title")?,
        provider_id: r.get("provider_id")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
    })
}
/// List live conversations by most recent activity.
pub fn list(conn: &Connection) -> AppResult<Vec<Conversation>> {
    Ok(conn.prepare("SELECT * FROM ai_conversation WHERE deleted_at IS NULL ORDER BY updated_at DESC,id DESC")?.query_map([],map)?.collect::<Result<Vec<_>,_>>()?)
}
/// Read ordered messages, without deriving context from frontend-provided text.
pub fn get(conn: &Connection, id: &str) -> AppResult<ConversationDetail> {
    let conversation = conn
        .query_row(
            "SELECT * FROM ai_conversation WHERE id=? AND deleted_at IS NULL",
            [id],
            map,
        )
        .optional()?
        .ok_or(AppError::NotFound)?;
    let messages = conn.prepare("SELECT id,conversation_id,role,content,refs,created_at FROM ai_message WHERE conversation_id=? ORDER BY created_at,id")?.query_map([id], |r| {
        let raw:String = r.get(4)?;
        let refs = serde_json::from_str(&raw).map_err(|e|rusqlite::Error::FromSqlConversionFailure(4,rusqlite::types::Type::Text,Box::new(e)))?;
        Ok(SavedMessage { id:r.get(0)?,conversation_id:r.get(1)?,role:r.get(2)?,content:r.get(3)?,refs,created_at:r.get(5)? })
    })?.collect::<Result<Vec<_>,_>>()?;
    Ok(ConversationDetail {
        conversation,
        messages,
    })
}
/// Create a conversation or verify its existing live identity before appending a user message.
pub fn begin(
    tx: &Transaction<'_>,
    id: &str,
    provider: &str,
    text: &str,
    refs: &[EntityRef],
    now: i64,
) -> AppResult<()> {
    let exists: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM ai_conversation WHERE id=?)",
        [id],
        |r| r.get(0),
    )?;
    if !exists {
        tx.execute("INSERT INTO ai_conversation(id,title,provider_id,created_at,updated_at) VALUES (?,?,?,?,?)",params![id,text.chars().take(40).collect::<String>(),provider,now,now])?;
    }
    get(tx, id)?;
    append(tx, id, "user", text, refs, now)
}
/// Append only explicit user text or a successfully completed, redacted assistant result.
pub fn append(
    tx: &Transaction<'_>,
    id: &str,
    role: &str,
    text: &str,
    refs: &[EntityRef],
    now: i64,
) -> AppResult<()> {
    get(tx, id)?;
    tx.execute("INSERT INTO ai_message(id,conversation_id,role,content,refs,created_at) VALUES (?,?,?,?,?,?)",params![uuid::Uuid::now_v7().to_string(),id,role,text,serde_json::to_string(refs)?,now])?;
    tx.execute(
        "UPDATE ai_conversation SET updated_at=? WHERE id=?",
        params![now, id],
    )?;
    Ok(())
}
/// Rename or soft-delete an existing conversation.
pub fn change(tx: &Transaction<'_>, id: &str, title: Option<&str>, now: i64) -> AppResult<()> {
    get(tx, id)?;
    if let Some(title) = title {
        if title.trim().is_empty() || title.chars().count() > 200 {
            return Err(AppError::Invalid("Invalid conversation title".into()));
        }
        tx.execute(
            "UPDATE ai_conversation SET title=?,updated_at=? WHERE id=?",
            params![title.trim(), now, id],
        )?;
    } else {
        tx.execute(
            "UPDATE ai_conversation SET deleted_at=?,updated_at=? WHERE id=?",
            params![now, now, id],
        )?;
    }
    Ok(())
}
