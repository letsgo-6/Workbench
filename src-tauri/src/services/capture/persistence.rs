use crate::{
    domain::{
        capture::*, common::*, idea::IdeaInput, prompt::PromptInput, skill::SkillInput,
        tip::TipInput, todo::TodoInput,
    },
    error::AppResult,
    repo,
};

/// Inputs already checked by the same command validators as ordinary creation.
pub enum PreparedItem {
    Idea(IdeaInput),
    Todo(TodoInput),
    Tip(TipInput),
    Skill(SkillInput),
    Prompt(PromptInput),
    Material(crate::domain::material::MaterialInput),
}
/// Persist the entire reviewed capture and its search projections atomically.
pub fn commit(
    tx: &rusqlite::Transaction<'_>,
    items: &[PreparedItem],
    now: i64,
) -> AppResult<CaptureCommitResult> {
    let refs = items
        .iter()
        .map(|item| {
            let (entity_type, id) = match item {
                PreparedItem::Material(v) => (
                    EntityType::Material,
                    repo::materials::create(tx, v, now, None)?.id,
                ),
                PreparedItem::Idea(v) => {
                    (EntityType::Idea, repo::ideas::create(tx, v, now, None)?.id)
                }
                PreparedItem::Todo(v) => {
                    (EntityType::Todo, repo::todos::create(tx, v, now, None)?.id)
                }
                PreparedItem::Tip(v) => (EntityType::Tip, repo::tips::create(tx, v, now, None)?.id),
                PreparedItem::Skill(v) => (
                    EntityType::Skill,
                    repo::skills::create(tx, v, now, None)?.id,
                ),
                PreparedItem::Prompt(v) => (
                    EntityType::Prompt,
                    repo::prompts::create(tx, v, now, None)?.id,
                ),
            };
            Ok(EntityRef { entity_type, id })
        })
        .collect::<AppResult<Vec<_>>>()?;
    Ok(CaptureCommitResult {
        refs,
        created_at: now,
    })
}
/// Purge only unchanged capture records; a repeated undo safely skips missing rows.
pub fn undo(
    tx: &rusqlite::Transaction<'_>,
    input: &CaptureUndoInput,
    now: i64,
) -> AppResult<CaptureUndoResult> {
    let mut result = CaptureUndoResult {
        removed: 0,
        skipped: 0,
    };
    for r in &input.refs {
        if repo::common::capture_unchanged(tx, r, input.created_at)? {
            repo::common::mutate(tx, r, "purge", now, false)?;
            result.removed += 1;
        } else {
            result.skipped += 1;
        }
    }
    Ok(result)
}
