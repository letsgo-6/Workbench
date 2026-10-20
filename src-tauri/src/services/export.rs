use crate::{
    domain::skill::Skill,
    error::{AppError, AppResult},
};
use std::path::{Path, PathBuf};
/// Sanitize portable names, including reserved Windows device names.
pub fn filename(name: &str) -> String {
    let name: String = name
        .chars()
        .filter(|c| !"<>:\"/\\|?*".contains(*c) && !c.is_control())
        .take(100)
        .collect();
    let name = name.trim().trim_matches('.').to_string();
    let name = if name.is_empty() {
        "skill".into()
    } else {
        name
    };
    let stem = name.split('.').next().unwrap_or("").to_uppercase();
    if [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]
    .contains(&stem.as_str())
    {
        format!("{name}_")
    } else {
        name
    }
}
/// Export an existing Skill, adding frontmatter when the source lacks it.
pub fn skill(item: &Skill, path: &Path, folder: bool) -> AppResult<PathBuf> {
    let content = item.content_md.as_deref().unwrap_or("");
    let content = if super::skill_parse::parse(content)?.has_frontmatter {
        content.to_string()
    } else {
        let front = serde_yaml_ng::to_string(
            &serde_json::json!({"name":item.name,"description":item.description}),
        )
        .map_err(|e| AppError::Invalid(e.to_string()))?;
        format!("---\n{front}---\n\n{content}")
    };
    let target = if folder {
        let dir = path.join(filename(&item.name));
        std::fs::create_dir_all(&dir)?;
        dir.join("SKILL.md")
    } else {
        path.to_path_buf()
    };
    if !target
        .extension()
        .is_some_and(|s| s.eq_ignore_ascii_case("md"))
    {
        return Err(AppError::Invalid("Export target must end in .md".into()));
    }
    std::fs::write(&target, content)?;
    Ok(target)
}
