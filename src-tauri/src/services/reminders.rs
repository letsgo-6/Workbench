use crate::{db::Db, domain::todo::Todo, error::AppResult, repo};
use chrono::{Local, TimeZone};
/// Resolve date-only reminders in local time, including timezone transitions.
pub fn effective(item: &Todo, time: &str) -> Option<i64> {
    item.remind_at.or_else(|| {
        let day = chrono::NaiveDate::parse_from_str(item.due_date.as_deref()?, "%Y-%m-%d").ok()?;
        let time = chrono::NaiveTime::parse_from_str(time, "%H:%M").ok()?;
        Local
            .from_local_datetime(&day.and_time(time))
            .earliest()
            .map(|t| t.timestamp_millis())
    })
}
/// Send and mark each due live task once; a rejected notification leaves it retryable.
pub fn dispatch(db: &Db, now: i64, mut send: impl FnMut(&Todo) -> AppResult<()>) -> AppResult<u32> {
    let settings = db.with_conn(repo::settings::get_all)?;
    if !settings.todo_reminders_enabled {
        return Ok(0);
    }
    let ids=db.with_conn(|conn|Ok(conn.prepare("SELECT id FROM todo WHERE deleted_at IS NULL AND status='todo' AND reminded_at IS NULL AND (remind_at IS NOT NULL OR due_date IS NOT NULL)")?.query_map([],|r|r.get::<_,String>(0))?.collect::<Result<Vec<_>,_>>()?))?;
    let mut sent = 0;
    for id in ids {
        sent += db.with_tx(|tx| {
            let item = repo::todos::get(tx, &id)?;
            if item.status == "todo"
                && item.reminded_at.is_none()
                && effective(&item, &settings.todo_default_remind_time).is_some_and(|at| at <= now)
            {
                send(&item)?;
                tx.execute(
                    "UPDATE todo SET reminded_at=? WHERE id=?",
                    rusqlite::params![now, id],
                )?;
                return Ok(1);
            }
            Ok(0)
        })?;
    }
    Ok(sent)
}
