use crate::{
    domain::{common::*, tip::*},
    error::AppResult,
    events, repo,
    state::AppState,
};
/// Query a page using the caller's current local day.
#[tauri::command(async)]
pub fn tip_list(state: tauri::State<'_, AppState>, input: ListQuery) -> AppResult<Page<Tip>> {
    let (today, start, end) = super::local_day()?;
    state
        .db
        .with_conn(|c| repo::tips::list(c, &input, &today, start, end))
}
/// Read one content record.
#[tauri::command(async)]
pub fn tip_get(state: tauri::State<'_, AppState>, input: IdInput) -> AppResult<Tip> {
    state.db.with_conn(|c| repo::tips::get(c, &input.id))
}
/// Validate and create content.
#[tauri::command(async)]
pub fn tip_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: TipInput,
) -> AppResult<Tip> {
    super::prepare_tip(&mut input)?;
    super::validate(&serde_json::to_value(&input)?)?;
    let result = state.db.with_tx(|tx| {
        repo::tips::create(tx, &input, chrono::Utc::now().timestamp_millis(), None)
    })?;
    events::emit_data_changed(&app, "tip", "create")?;
    Ok(result)
}
/// Replace editable fields after validation.
#[tauri::command(async)]
pub fn tip_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: TipUpdateInput,
) -> AppResult<Tip> {
    super::prepare_tip(&mut input.data)?;
    super::validate(&serde_json::to_value(&input.data)?)?;
    let result = state.db.with_tx(|tx| {
        repo::tips::update(
            tx,
            &input.id,
            &input.data,
            chrono::Utc::now().timestamp_millis(),
        )
    })?;
    events::emit_data_changed(&app, "tip", "update")?;
    Ok(result)
}
/// Set a single star flag.
#[tauri::command(async)]
pub fn tip_set_starred(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: StarInput,
) -> AppResult<Tip> {
    let result = state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Tip,
                id: input.id.clone(),
            },
            "star",
            chrono::Utc::now().timestamp_millis(),
            input.starred,
        )?;
        repo::tips::get(tx, &input.id)
    })?;
    events::emit_data_changed(&app, "tip", "update")?;
    Ok(result)
}
/// Soft-delete content into the recycle bin.
#[tauri::command(async)]
pub fn tip_delete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Tip,
                id: input.id,
            },
            "delete",
            chrono::Utc::now().timestamp_millis(),
            false,
        )
    })?;
    events::emit_data_changed(&app, "tip", "delete")
}
