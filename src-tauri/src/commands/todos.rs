use crate::{
    domain::{common::*, todo::*},
    error::AppResult,
    events, repo,
    state::AppState,
};
/// Query a page using the caller's current local day.
#[tauri::command(async)]
pub fn todo_list(state: tauri::State<'_, AppState>, input: ListQuery) -> AppResult<Page<Todo>> {
    let (today, start, end) = super::local_day()?;
    state
        .db
        .with_conn(|c| repo::todos::list(c, &input, &today, start, end))
}
/// Read one content record.
#[tauri::command(async)]
pub fn todo_get(state: tauri::State<'_, AppState>, input: IdInput) -> AppResult<Todo> {
    state.db.with_conn(|c| repo::todos::get(c, &input.id))
}
/// Read one level of subtasks.
#[tauri::command(async)]
pub fn todo_children(state: tauri::State<'_, AppState>, input: IdInput) -> AppResult<Vec<Todo>> {
    state.db.with_conn(|c| repo::todos::children(c, &input.id))
}
/// Create a reviewed AI breakdown as one atomic batch.
#[tauri::command(async)]
pub fn todo_create_batch(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: Vec<TodoInput>,
) -> AppResult<Vec<Todo>> {
    if input.is_empty() || input.len() > 100 {
        return Err(crate::error::AppError::Invalid("Choose 1–100 tasks".into()));
    }
    for item in &mut input {
        super::prepare_todo(item)?;
        super::validate(&serde_json::to_value(&item)?)?;
    }
    let result = state.db.with_tx(|tx| {
        input
            .iter()
            .map(|item| repo::todos::create(tx, item, chrono::Utc::now().timestamp_millis(), None))
            .collect()
    })?;
    events::emit_data_changed(&app, "todo", "create")?;
    Ok(result)
}
/// Validate and create content.
#[tauri::command(async)]
pub fn todo_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: TodoInput,
) -> AppResult<Todo> {
    super::prepare_todo(&mut input)?;
    super::validate(&serde_json::to_value(&input)?)?;
    let result = state.db.with_tx(|tx| {
        repo::todos::create(tx, &input, chrono::Utc::now().timestamp_millis(), None)
    })?;
    events::emit_data_changed(&app, "todo", "create")?;
    Ok(result)
}
/// Replace editable fields after validation.
#[tauri::command(async)]
pub fn todo_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: TodoUpdateInput,
) -> AppResult<Todo> {
    super::prepare_todo(&mut input.data)?;
    super::validate(&serde_json::to_value(&input.data)?)?;
    let result = state.db.with_tx(|tx| {
        repo::todos::update(
            tx,
            &input.id,
            &input.data,
            chrono::Utc::now().timestamp_millis(),
        )
    })?;
    events::emit_data_changed(&app, "todo", "update")?;
    Ok(result)
}
/// Set a single star flag.
#[tauri::command(async)]
pub fn todo_set_starred(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: StarInput,
) -> AppResult<Todo> {
    let result = state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Todo,
                id: input.id.clone(),
            },
            "star",
            chrono::Utc::now().timestamp_millis(),
            input.starred,
        )?;
        repo::todos::get(tx, &input.id)
    })?;
    events::emit_data_changed(&app, "todo", "update")?;
    Ok(result)
}
/// Soft-delete content into the recycle bin.
#[tauri::command(async)]
pub fn todo_delete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Todo,
                id: input.id,
            },
            "delete",
            chrono::Utc::now().timestamp_millis(),
            false,
        )
    })?;
    events::emit_data_changed(&app, "todo", "delete")
}

/// Toggle completion and its timestamp in one transaction.
#[tauri::command(async)]
pub fn todo_toggle_done(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<Todo> {
    let result = state.db.with_tx(|tx| {
        let current = repo::todos::get(tx, &input.id)?;
        let now = chrono::Utc::now().timestamp_millis();
        let done = current.status != "done";
        tx.execute(
            "UPDATE todo SET status=?,completed_at=?,updated_at=? WHERE id=?",
            rusqlite::params![
                if done { "done" } else { "todo" },
                if done { Some(now) } else { None },
                now,
                input.id
            ],
        )?;
        repo::search::upsert(
            tx,
            &EntityRef {
                entity_type: EntityType::Todo,
                id: input.id.clone(),
            },
        )?;
        repo::todos::get(tx, &input.id)
    })?;
    events::emit_data_changed(&app, "todo", "update")?;
    Ok(result)
}
