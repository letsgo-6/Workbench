use crate::{
    domain::{common::*, idea::*},
    error::AppResult,
    events, repo,
    state::AppState,
};
#[derive(serde::Deserialize)]
pub struct MonthInput {
    pub month: String,
}
/// Read daily idea counts for the calendar without loading every item.
#[tauri::command(async)]
pub fn idea_calendar(
    state: tauri::State<'_, AppState>,
    input: MonthInput,
) -> AppResult<Vec<crate::domain::calendar::CalendarDay>> {
    state
        .db
        .with_conn(|c| repo::ideas::calendar(c, &input.month))
}
/// Query a page using the caller's current local day.
#[tauri::command(async)]
pub fn idea_list(state: tauri::State<'_, AppState>, input: ListQuery) -> AppResult<Page<Idea>> {
    let (today, start, end) = super::local_day()?;
    state
        .db
        .with_conn(|c| repo::ideas::list(c, &input, &today, start, end))
}
/// Read one content record.
#[tauri::command(async)]
pub fn idea_get(state: tauri::State<'_, AppState>, input: IdInput) -> AppResult<Idea> {
    state.db.with_conn(|c| repo::ideas::get(c, &input.id))
}
/// Validate and create content.
#[tauri::command(async)]
pub fn idea_create(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: IdeaInput,
) -> AppResult<Idea> {
    super::prepare_idea(&mut input)?;
    super::validate(&serde_json::to_value(&input)?)?;
    let result = state.db.with_tx(|tx| {
        repo::ideas::create(tx, &input, chrono::Utc::now().timestamp_millis(), None)
    })?;
    events::emit_data_changed(&app, "idea", "create")?;
    Ok(result)
}
/// Replace editable fields after validation.
#[tauri::command(async)]
pub fn idea_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut input: IdeaUpdateInput,
) -> AppResult<Idea> {
    super::prepare_idea(&mut input.data)?;
    super::validate(&serde_json::to_value(&input.data)?)?;
    let result = state.db.with_tx(|tx| {
        repo::ideas::update(
            tx,
            &input.id,
            &input.data,
            chrono::Utc::now().timestamp_millis(),
        )
    })?;
    events::emit_data_changed(&app, "idea", "update")?;
    Ok(result)
}
/// Set a single star flag.
#[tauri::command(async)]
pub fn idea_set_starred(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: StarInput,
) -> AppResult<Idea> {
    let result = state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Idea,
                id: input.id.clone(),
            },
            "star",
            chrono::Utc::now().timestamp_millis(),
            input.starred,
        )?;
        repo::ideas::get(tx, &input.id)
    })?;
    events::emit_data_changed(&app, "idea", "update")?;
    Ok(result)
}
/// Soft-delete content into the recycle bin.
#[tauri::command(async)]
pub fn idea_delete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<()> {
    state.db.with_tx(|tx| {
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Idea,
                id: input.id,
            },
            "delete",
            chrono::Utc::now().timestamp_millis(),
            false,
        )
    })?;
    events::emit_data_changed(&app, "idea", "delete")
}

#[derive(serde::Deserialize)]
pub struct ConvertInput {
    pub id: String,
    pub target: EntityType,
}
/// Copy an idea into another module while preserving its origin link.
#[tauri::command(async)]
pub fn idea_convert(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: ConvertInput,
) -> AppResult<EntityRef> {
    let result = state.db.with_tx(|tx| {
        let item = repo::ideas::get(tx, &input.id)?;
        let origin = EntityRef {
            entity_type: EntityType::Idea,
            id: item.id,
        };
        let tags = item.tags.into_iter().map(|t| t.name).collect();
        let title = item
            .content_md
            .lines()
            .next()
            .unwrap_or("")
            .trim_start_matches(['#', ' '])
            .chars()
            .take(500)
            .collect::<String>();
        let now = chrono::Utc::now().timestamp_millis();
        let id = match input.target {
            EntityType::Todo => {
                repo::todos::create(
                    tx,
                    &crate::domain::todo::TodoInput {
                        title: if title.is_empty() {
                            return Err(crate::error::AppError::Invalid(
                                "An empty idea cannot be converted into a todo".into(),
                            ));
                        } else {
                            title
                        },
                        note_md: item.content_md,
                        due_date: Some(chrono::Local::now().date_naive().to_string()),
                        priority: 2,
                        tags,
                        ..Default::default()
                    },
                    now,
                    Some(&origin),
                )?
                .id
            }
            EntityType::Tip => {
                repo::tips::create(
                    tx,
                    &crate::domain::tip::TipInput {
                        title,
                        content_md: item.content_md,
                        tags,
                        ..Default::default()
                    },
                    now,
                    Some(&origin),
                )?
                .id
            }
            EntityType::Prompt => {
                repo::prompts::create(
                    tx,
                    &crate::domain::prompt::PromptInput {
                        title,
                        body: item.content_md,
                        tags,
                        ..Default::default()
                    },
                    now,
                    Some(&origin),
                )?
                .id
            }
            _ => {
                return Err(crate::error::AppError::Invalid(
                    "Unsupported conversion target".into(),
                ));
            }
        };
        Ok(EntityRef {
            entity_type: input.target,
            id,
        })
    })?;
    events::emit_data_changed(&app, "all", "create")?;
    Ok(result)
}
