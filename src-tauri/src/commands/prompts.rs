use crate::{
    domain::{common::*, prompt::*},
    error::AppResult,
    events, repo,
    state::AppState,
};
/// Query a page using the caller's current local day.
#[tauri::command(async)]
pub fn prompt_list(state: tauri::State<'_, AppState>, input: ListQuery) -> AppResult<Page<Prompt>> {
    let (today, start, end) = super::local_day()?;
    state
        .db
        .with_conn(|c| repo::prompts::list(c, &input, &today, start, end))
}
/// Read one content record.
#[tauri::command(async)]
pub fn prompt_get(state: tauri::State<'_, AppState>, input: IdInput) -> AppResult<Prompt> {
    state.db.with_conn(|c| repo::prompts::get(c, &input.id))
}
/// Validate and create content.
#[tauri::command(async)]
pub fn prompt_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: PromptInput,
) -> AppResult<Prompt> {
    super::prepare_prompt(&mut input)?;
    super::validate(&serde_json::to_value(&input)?)?;
    let result = state.db.with_tx(|tx| {
        repo::prompts::create(tx, &input, chrono::Utc::now().timestamp_millis(), None)
    })?;
    events::emit_data_changed(&app, "prompt", "create")?;
    Ok(result)
}
/// Replace editable fields after validation.
#[tauri::command(async)]
pub fn prompt_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: PromptUpdateInput,
) -> AppResult<Prompt> {
    super::prepare_prompt(&mut input.data)?;
    super::validate(&serde_json::to_value(&input.data)?)?;
    let result = state.db.with_tx(|tx| {
        repo::prompts::update(
            tx,
            &input.id,
            &input.data,
            chrono::Utc::now().timestamp_millis(),
        )
    })?;
    events::emit_data_changed(&app, "prompt", "update")?;
    Ok(result)
}
/// Set a single star flag.
#[tauri::command(async)]
pub fn prompt_set_starred(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: StarInput,
) -> AppResult<Prompt> {
    let result = state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Prompt,
                id: input.id.clone(),
            },
            "star",
            chrono::Utc::now().timestamp_millis(),
            input.starred,
        )?;
        repo::prompts::get(tx, &input.id)
    })?;
    events::emit_data_changed(&app, "prompt", "update")?;
    Ok(result)
}
/// Soft-delete content into the recycle bin.
#[tauri::command(async)]
pub fn prompt_delete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Prompt,
                id: input.id,
            },
            "delete",
            chrono::Utc::now().timestamp_millis(),
            false,
        )
    })?;
    events::emit_data_changed(&app, "prompt", "delete")
}

/// Increment usage only after a successful clipboard write.
#[tauri::command(async)]
pub fn prompt_record_use(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<Prompt> {
    let result = state.db.with_tx(|tx| {
        repo::prompts::get(tx, &input.id)?;
        tx.execute(
            "UPDATE prompt SET use_count=use_count+1,updated_at=? WHERE id=?",
            rusqlite::params![chrono::Utc::now().timestamp_millis(), input.id],
        )?;
        repo::prompts::get(tx, &input.id)
    })?;
    events::emit_data_changed(&app, "prompt", "update")?;
    Ok(result)
}
/// List existing user prompt categories.
#[tauri::command(async)]
pub fn prompt_categories(state: tauri::State<'_, AppState>) -> AppResult<Vec<String>> {
    state.db.with_conn(|c|{let mut stmt=c.prepare("SELECT DISTINCT category FROM prompt WHERE deleted_at IS NULL AND is_system_template=0 AND category<>'' ORDER BY category")?;Ok(stmt.query_map([],|r|r.get(0))?.collect::<Result<Vec<_>,_>>()?)})
}
