use crate::{
    domain::{common::*, material::*},
    error::{AppError, AppResult},
    events, repo,
    services::assets,
    state::AppState,
};
fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
/// List material metadata and resolve only owned media paths.
#[tauri::command(async)]
pub fn material_list(
    state: tauri::State<'_, AppState>,
    input: ListQuery,
) -> AppResult<Page<Material>> {
    let _guard = state.asset_mutations.lock();
    let mut page = state.db.with_conn(|c| repo::materials::list(c, &input))?;
    for item in &mut page.items {
        assets::hydrate(&state.paths.assets_dir, item)?;
    }
    Ok(page)
}
/// Read a material, recovering retained files when possible.
#[tauri::command(async)]
pub fn material_get(state: tauri::State<'_, AppState>, input: IdInput) -> AppResult<Material> {
    let _guard = state.asset_mutations.lock();
    let mut item = state.db.with_conn(|c| repo::materials::get(c, &input.id))?;
    assets::hydrate(&state.paths.assets_dir, &mut item)?;
    Ok(item)
}
/// Create a validated text-only work or component.
#[tauri::command(async)]
pub fn material_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: MaterialInput,
) -> AppResult<Material> {
    assets::validate_input(&mut input)?;
    let item = state
        .db
        .with_tx(|tx| repo::materials::create(tx, &input, now(), None))?;
    events::emit_data_changed(&app, "material", "create")?;
    Ok(item)
}
/// Replace editable metadata, keeping media untouched.
#[tauri::command(async)]
pub fn material_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: MaterialUpdateInput,
) -> AppResult<Material> {
    let _guard = state.asset_mutations.lock();
    assets::validate_input(&mut input.data)?;
    let mut item = state
        .db
        .with_tx(|tx| repo::materials::update(tx, &input.id, &input.data, now()))?;
    assets::hydrate(&state.paths.assets_dir, &mut item)?;
    events::emit_data_changed(&app, "material", "update")?;
    Ok(item)
}
/// Change one star flag.
#[tauri::command(async)]
pub fn material_set_starred(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: StarInput,
) -> AppResult<Material> {
    state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Material,
                id: input.id.clone(),
            },
            "star",
            now(),
            input.starred,
        )
    })?;
    events::emit_data_changed(&app, "material", "update")?;
    material_get(state, IdInput { id: input.id })
}
/// Soft-delete without moving any media.
#[tauri::command(async)]
pub fn material_delete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Material,
                id: input.id,
            },
            "delete",
            now(),
            false,
        )
    })?;
    events::emit_data_changed(&app, "material", "delete")
}
/// Import up to fifty native file paths atomically.
#[tauri::command(async)]
pub fn material_import_files(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: MaterialImportInput,
) -> AppResult<MaterialImportResult> {
    let _guard = state.asset_mutations.lock();
    let result = assets::import_files(&state.db, &state.paths.assets_dir, &input, now())?;
    events::emit_data_changed(&app, "material", "import")?;
    Ok(result)
}
fn header(request: &tauri::ipc::Request<'_>, key: &str) -> AppResult<String> {
    request
        .headers()
        .get(key)
        .and_then(|s| s.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| AppError::Invalid("Missing binary request metadata".into()))
}
fn raw<'a>(request: &'a tauri::ipc::Request<'_>) -> AppResult<&'a [u8]> {
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => Ok(bytes),
        _ => Err(AppError::Invalid("Binary body required".into())),
    }
}
/// Import clipboard bytes directly, without serializing them as JSON arrays.
#[tauri::command(async)]
pub fn material_import_bytes(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<MaterialImportResult> {
    let _guard = state.asset_mutations.lock();
    let bytes = raw(&request)?;
    let encoded = header(&request, "x-name")?;
    let url = reqwest::Url::parse(&format!("https://localhost/?name={encoded}"))
        .map_err(|_| AppError::Invalid("Invalid file name".into()))?;
    let name = url
        .query_pairs()
        .next()
        .map(|(_, v)| v.into_owned())
        .unwrap_or_default();
    let (kind, mime, _) = assets::sniff(&name, bytes, bytes.len() as u64)?;
    if kind == "video" || header(&request, "x-mime")? != mime {
        return Err(AppError::Invalid("Clipboard MIME mismatch".into()));
    }
    let mut files = assets::PendingFiles::default();
    let at = now();
    let record = assets::stage_reader(
        &state.paths.assets_dir,
        &name,
        &mut std::io::Cursor::new(bytes),
        bytes.len() as u64,
        at,
        &mut files,
    )?;
    let result = assets::commit_staged(
        &state.db,
        &state.paths.assets_dir,
        request
            .headers()
            .get("x-material-id")
            .and_then(|v| v.to_str().ok()),
        request
            .headers()
            .get("x-kind")
            .and_then(|v| v.to_str().ok()),
        vec![record],
        at,
        &mut files,
    )?;
    events::emit_data_changed(&app, "material", "import")?;
    Ok(result)
}
/// Store a verified WebP thumbnail and original media dimensions.
#[tauri::command(async)]
pub fn asset_set_thumbnail(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<MaterialAsset> {
    let _guard = state.asset_mutations.lock();
    let parse = |name| {
        header(&request, name)?
            .parse::<u32>()
            .map_err(|_| AppError::Invalid("Invalid media dimensions".into()))
    };
    let duration = request
        .headers()
        .get("x-duration-ms")
        .map(|_| parse("x-duration-ms"))
        .transpose()?;
    let result = assets::set_thumbnail(
        &state.db,
        &state.paths.assets_dir,
        &header(&request, "x-asset-id")?,
        raw(&request)?,
        assets::ThumbnailInfo {
            width: parse("x-width")?,
            height: parse("x-height")?,
            duration_ms: duration,
        },
        now(),
    )?;
    events::emit_data_changed(&app, "material", "update")?;
    Ok(result)
}
/// Persist a complete ordered file list.
#[tauri::command(async)]
pub fn asset_reorder(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: AssetOrderInput,
) -> AppResult<()> {
    state
        .db
        .with_tx(|tx| repo::materials::reorder(tx, &input, now()))?;
    events::emit_data_changed(&app, "material", "update")
}
/// Delete one file through the retained-file lifecycle.
#[tauri::command(async)]
pub fn asset_delete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<()> {
    let _guard = state.asset_mutations.lock();
    assets::delete_asset(&state.db, &state.paths.assets_dir, &input.id, now())?;
    events::emit_data_changed(&app, "material", "purge")
}
/// Set a cover only from this material's owned files.
#[tauri::command(async)]
pub fn material_set_cover(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: MaterialCoverInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::materials::check_asset(tx, &input.material_id, &input.asset_id)?;
        tx.execute(
            "UPDATE material SET cover_asset_id=?,updated_at=? WHERE id=?",
            rusqlite::params![input.asset_id, now(), input.material_id],
        )?;
        Ok(())
    })?;
    events::emit_data_changed(&app, "material", "update")
}
/// Report active and retained disk usage.
#[tauri::command(async)]
pub fn assets_usage(state: tauri::State<'_, AppState>) -> AppResult<AssetsUsage> {
    assets::usage(&state.paths.assets_dir)
}
/// Discard an untouched empty material without risking a newly attached file.
#[tauri::command(async)]
pub fn material_discard_empty(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<bool> {
    let _guard = state.asset_mutations.lock();
    let removed = assets::discard_empty(&state.db, &input.id, now())?;
    if removed {
        events::emit_data_changed(&app, "material", "purge")?;
    }
    Ok(removed)
}
