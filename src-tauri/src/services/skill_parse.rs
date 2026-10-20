use crate::{
    domain::skill_parse::*,
    error::{AppError, AppResult},
};
use std::path::Path;
/// Parse YAML only when a complete frontmatter fence is present.
pub fn parse(content: &str) -> AppResult<ParsedSkill> {
    let normalized = content.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    if !normalized.starts_with("---\n") {
        return Ok(ParsedSkill::default());
    }
    let rest = &normalized[4..];
    let end = rest
        .find("\n---")
        .filter(|&end| rest[end + 4..].is_empty() || rest[end + 4..].starts_with('\n'))
        .ok_or_else(|| AppError::Invalid("Unclosed frontmatter".into()))?;
    let yaml: serde_yaml_ng::Value =
        serde_yaml_ng::from_str(&rest[..end]).map_err(|e| AppError::Invalid(e.to_string()))?;
    if !yaml.is_mapping() {
        return Err(AppError::Invalid("Frontmatter must be a mapping".into()));
    }
    let field = |name: &str| {
        yaml.get(name)
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_string())
    };
    Ok(ParsedSkill {
        name: field("name"),
        description: field("description"),
        has_frontmatter: true,
    })
}
/// Read at most one MiB from a Markdown file selected by the user.
pub fn read(path: &Path) -> AppResult<ReadSkill> {
    if !path
        .extension()
        .is_some_and(|s| s.eq_ignore_ascii_case("md"))
    {
        return Err(AppError::Invalid(
            "Only Markdown files are supported".into(),
        ));
    }
    if std::fs::metadata(path)?.len() > 1048576 {
        return Err(AppError::Invalid("Markdown file exceeds 1 MiB".into()));
    }
    let content = std::fs::read_to_string(path)?;
    let parsed = parse(&content)?;
    Ok(ReadSkill { content, parsed })
}
