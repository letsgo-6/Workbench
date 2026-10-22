use crate::{domain::common::*, error::AppResult, events, repo, state::AppState};
#[derive(serde::Deserialize)]
pub struct PathInput {
    pub path: String,
}
/// Export a complete live-content Markdown folder tree with safe unique file names.
#[tauri::command(async)]
pub fn data_export_markdown(state: tauri::State<'_, AppState>, input: PathInput) -> AppResult<u32> {
    let _guard = state.asset_mutations.lock();
    crate::services::assets::validate_export_target(
        &state.paths,
        std::path::Path::new(&input.path),
    )?;
    state.db.with_conn(|c| {
        crate::services::markdown_export::export_with_assets(
            c,
            std::path::Path::new(&input.path),
            &state.paths.assets_dir,
        )
    })
}
#[derive(serde::Deserialize)]
pub struct ImportInput {
    pub path: String,
    pub mode: String,
}
/// Write a complete JSON backup containing no credentials.
#[tauri::command(async)]
pub fn data_export_json(state: tauri::State<'_, AppState>, input: PathInput) -> AppResult<()> {
    crate::services::assets::validate_export_target(
        &state.paths,
        std::path::Path::new(&input.path),
    )?;
    let backup = state.db.with_conn(crate::services::data::export)?;
    std::fs::write(input.path, serde_json::to_vec_pretty(&backup)?)?;
    Ok(())
}
/// Export a complete portable backup containing verified original files and thumbnails.
#[tauri::command(async)]
pub fn data_export_backup(state: tauri::State<'_, AppState>, input: PathInput) -> AppResult<()> {
    crate::services::assets::validate_export_target(
        &state.paths,
        std::path::Path::new(&input.path),
    )?;
    let _guard = state.asset_mutations.lock();
    crate::services::backup_package::export(
        &state.db,
        &state.paths.assets_dir,
        std::path::Path::new(&input.path),
    )
}
/// Back up before a single atomic import, requiring credentials to be entered again.
#[tauri::command(async)]
pub fn data_import_json(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: ImportInput,
) -> AppResult<crate::domain::data::ImportReport> {
    let _guard = state.credential_mutations.lock();
    let _asset_guard = state.asset_mutations.lock();
    let result = if std::path::Path::new(&input.path)
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("wbbackup"))
    {
        crate::services::backup_package::import(
            &state.db,
            &state.secrets,
            &state.paths,
            std::path::Path::new(&input.path),
            &input.mode,
        )?
    } else {
        crate::services::data::import(
            &state.db,
            &state.secrets,
            &state.paths.backups_dir,
            std::path::Path::new(&input.path),
            &input.mode,
        )?
    };
    let settings = state.db.with_conn(repo::settings::get_all)?;
    state.ai.configure(&settings.network_proxy)?;
    let _ = crate::desktop::shortcut::update(&app, &state, &settings.shortcut_quick_capture, false);
    events::emit_data_changed(&app, "all", "import")?;
    Ok(result)
}
/// Open the directory through the native system shell.
#[tauri::command]
pub fn data_open_dir(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(state.paths.data_dir.to_string_lossy(), None::<&str>)
        .map_err(|_| crate::error::AppError::Invalid("Cannot open data directory".into()))
}
/// Snapshot to a new directory, retain the old database and restart to reopen safely.
#[tauri::command(async)]
pub fn data_change_dir(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: PathInput,
) -> AppResult<()> {
    let _guard = state.asset_mutations.lock();
    crate::services::assets::change_directory(
        &state.db,
        &state.paths,
        std::path::Path::new(&input.path),
    )?;
    app.restart()
}
/// Delete selected records atomically.
#[tauri::command(async)]
pub fn entity_bulk_delete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: BulkInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        for r in input.refs {
            repo::common::mutate(
                tx,
                &r,
                "delete",
                chrono::Utc::now().timestamp_millis(),
                false,
            )?;
        }
        Ok(())
    })?;
    events::emit_data_changed(&app, "all", "delete")
}
/// Add tags without removing existing names.
#[tauri::command(async)]
pub fn entity_bulk_add_tags(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: BulkInput,
) -> AppResult<()> {
    super::validate(&serde_json::to_value(&input)?)?;
    state.db.with_tx(|tx| {
        for r in input.refs {
            let now = chrono::Utc::now().timestamp_millis();
            let changed = tx.execute(
                &format!(
                    "UPDATE {} SET updated_at=? WHERE id=? AND deleted_at IS NULL",
                    r.entity_type.table()
                ),
                rusqlite::params![now, r.id],
            )?;
            if changed == 0 {
                return Err(crate::error::AppError::NotFound);
            }
            let mut names =
                repo::common::load_tags_for(tx, r.entity_type, std::slice::from_ref(&r.id))?
                    .remove(&r.id)
                    .unwrap_or_default()
                    .into_iter()
                    .map(|t| t.name)
                    .collect::<Vec<_>>();
            names.extend(input.tags.clone());
            repo::common::set_tags(tx, &r, &names, now)?;
            repo::search::upsert(tx, &r)?;
        }
        Ok(())
    })?;
    events::emit_data_changed(&app, "all", "update")
}
