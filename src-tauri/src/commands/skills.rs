use crate::{
    domain::{common::*, skill::*},
    error::AppResult,
    events, repo,
    state::AppState,
};
/// Query a page using the caller's current local day.
#[tauri::command(async)]
pub fn skill_list(state: tauri::State<'_, AppState>, input: ListQuery) -> AppResult<Page<Skill>> {
    let (today, start, end) = super::local_day()?;
    state
        .db
        .with_conn(|c| repo::skills::list(c, &input, &today, start, end))
}
/// Read one content record.
#[tauri::command(async)]
pub fn skill_get(state: tauri::State<'_, AppState>, input: IdInput) -> AppResult<Skill> {
    state.db.with_conn(|c| repo::skills::get(c, &input.id))
}
/// Validate and create content.
#[tauri::command(async)]
pub fn skill_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: SkillInput,
) -> AppResult<Skill> {
    super::prepare_skill(&mut input)?;
    super::validate(&serde_json::to_value(&input)?)?;
    let result = state.db.with_tx(|tx| {
        repo::skills::create(tx, &input, chrono::Utc::now().timestamp_millis(), None)
    })?;
    events::emit_data_changed(&app, "skill", "create")?;
    Ok(result)
}
/// Replace editable fields after validation.
#[tauri::command(async)]
pub fn skill_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: SkillUpdateInput,
) -> AppResult<Skill> {
    super::prepare_skill(&mut input.data)?;
    super::validate(&serde_json::to_value(&input.data)?)?;
    let result = state.db.with_tx(|tx| {
        repo::skills::update(
            tx,
            &input.id,
            &input.data,
            chrono::Utc::now().timestamp_millis(),
        )
    })?;
    events::emit_data_changed(&app, "skill", "update")?;
    Ok(result)
}
/// Set a single star flag.
#[tauri::command(async)]
pub fn skill_set_starred(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: StarInput,
) -> AppResult<Skill> {
    let result = state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Skill,
                id: input.id.clone(),
            },
            "star",
            chrono::Utc::now().timestamp_millis(),
            input.starred,
        )?;
        repo::skills::get(tx, &input.id)
    })?;
    events::emit_data_changed(&app, "skill", "update")?;
    Ok(result)
}
/// Soft-delete content into the recycle bin.
#[tauri::command(async)]
pub fn skill_delete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Skill,
                id: input.id,
            },
            "delete",
            chrono::Utc::now().timestamp_millis(),
            false,
        )
    })?;
    events::emit_data_changed(&app, "skill", "delete")
}

#[derive(serde::Deserialize)]
pub struct ParseInput {
    pub content: String,
}
#[derive(serde::Deserialize)]
pub struct PathInput {
    pub path: String,
}
#[derive(serde::Deserialize)]
pub struct ExportInput {
    pub id: String,
    pub path: String,
}
#[derive(serde::Deserialize)]
pub struct FolderInput {
    pub id: String,
    pub dir: String,
}
#[derive(serde::Deserialize)]
pub struct UrlInput {
    pub url: String,
}
/// Parse a pasted Skill's YAML metadata.
#[tauri::command(async)]
pub fn skill_parse_markdown(
    input: ParseInput,
) -> AppResult<crate::domain::skill_parse::ParsedSkill> {
    super::validate(&serde_json::Value::String(input.content.clone()))?;
    crate::services::skill_parse::parse(&input.content)
}
/// Read one selected or dropped Markdown file.
#[tauri::command(async)]
pub fn skill_read_md_file(input: PathInput) -> AppResult<crate::domain::skill_parse::ReadSkill> {
    crate::services::skill_parse::read(std::path::Path::new(&input.path))
}
/// Export a Skill as a Markdown file.
#[tauri::command(async)]
pub fn skill_export_md(state: tauri::State<'_, AppState>, input: ExportInput) -> AppResult<String> {
    let item = state.db.with_conn(|c| repo::skills::get(c, &input.id))?;
    Ok(
        crate::services::export::skill(&item, std::path::Path::new(&input.path), false)?
            .to_string_lossy()
            .into(),
    )
}
/// Export the standard named Skill directory.
#[tauri::command(async)]
pub fn skill_export_folder(
    state: tauri::State<'_, AppState>,
    input: FolderInput,
) -> AppResult<String> {
    let item = state.db.with_conn(|c| repo::skills::get(c, &input.id))?;
    Ok(
        crate::services::export::skill(&item, std::path::Path::new(&input.dir), true)?
            .to_string_lossy()
            .into(),
    )
}
/// Retrieve optional link metadata without locking the database.
#[tauri::command]
pub async fn link_fetch_title(input: UrlInput) -> AppResult<Option<String>> {
    crate::services::link_meta::title(&input.url).await
}
/// Preview discovered Skill files, marking live duplicate names without importing yet.
#[tauri::command(async)]
pub fn skill_scan_folder(
    state: tauri::State<'_, AppState>,
    input: PathInput,
) -> AppResult<Vec<crate::domain::skill_transfer::SkillCandidate>> {
    let mut rows = crate::services::skill_transfer::scan(std::path::Path::new(&input.path))?;
    state.db.with_conn(|c| {for row in &mut rows {row.exists=c.query_row("SELECT EXISTS(SELECT 1 FROM skill WHERE name=? COLLATE NOCASE AND deleted_at IS NULL)",[&row.name],|r|r.get(0))?;}Ok(())})?;
    Ok(rows)
}
#[derive(serde::Deserialize)]
pub struct BatchInput {
    pub paths: Vec<String>,
}
/// Import only reviewed files, skipping duplicate live names in one transaction.
#[tauri::command(async)]
pub fn skill_import_batch(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: BatchInput,
) -> AppResult<crate::domain::skill_transfer::SkillBatchReport> {
    if input.paths.is_empty() || input.paths.len() > 1000 {
        return Err(crate::error::AppError::Invalid(
            "Choose 1–1000 Skills".into(),
        ));
    }
    let items = input
        .paths
        .iter()
        .map(|p| crate::services::skill_transfer::input(std::path::Path::new(p)))
        .collect::<AppResult<Vec<_>>>()?;
    let report=state.db.with_tx(|tx| {
        let mut report=crate::domain::skill_transfer::SkillBatchReport {inserted:0,skipped:0};
        for item in items {
            let exists:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM skill WHERE name=? COLLATE NOCASE AND deleted_at IS NULL)",[&item.name],|r|r.get(0))?;
            if exists {report.skipped+=1;} else {repo::skills::create(tx,&item,chrono::Utc::now().timestamp_millis(),None)?;report.inserted+=1;}
        }
        Ok(report)
    })?;
    events::emit_data_changed(&app, "skill", "create")?;
    Ok(report)
}
/// Fetch source text for a diff preview; this command never updates the saved Skill.
#[tauri::command]
pub async fn skill_fetch_remote(
    state: tauri::State<'_, AppState>,
    input: UrlInput,
) -> AppResult<String> {
    crate::services::skill_transfer::fetch(&state.ai.client(), &input.url).await
}
