use crate::{
    domain::{skill::SkillInput, skill_transfer::SkillCandidate},
    error::{AppError, AppResult, ErrorCode},
};
use futures_util::StreamExt;
use std::path::Path;
/// Walk at most five levels without following symbolic links or dependency directories.
pub fn scan(root: &Path) -> AppResult<Vec<SkillCandidate>> {
    fn walk(dir: &Path, depth: usize, result: &mut Vec<SkillCandidate>) -> AppResult<()> {
        if result.len() > 1000 {
            return Err(AppError::Invalid("Too many Skill files".into()));
        }
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let ty = entry.file_type()?;
            let name = entry.file_name();
            if ty.is_symlink() {
                continue;
            }
            if ty.is_dir() && depth < 5 && name != "node_modules" && name != ".git" {
                walk(&entry.path(), depth + 1, result)?;
            }
            if ty.is_file() && name.to_string_lossy().eq_ignore_ascii_case("SKILL.md") {
                let path = entry.path();
                let (name, description, error) = match input(&path) {
                    Ok(i) => (i.name, i.description, None),
                    Err(_) => (
                        path.parent()
                            .and_then(Path::file_name)
                            .map(|s| s.to_string_lossy().into())
                            .unwrap_or_default(),
                        String::new(),
                        Some("VALIDATION".into()),
                    ),
                };
                result.push(SkillCandidate {
                    path: path.to_string_lossy().into(),
                    name,
                    description,
                    exists: false,
                    error,
                });
            }
        }
        Ok(())
    }
    let mut result = vec![];
    walk(root, 0, &mut result)?;
    result.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}
/// Re-read selected files before the import transaction instead of trusting preview fields.
pub fn input(path: &Path) -> AppResult<SkillInput> {
    if !path
        .file_name()
        .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case("SKILL.md"))
    {
        return Err(AppError::Invalid("Expected SKILL.md".into()));
    }
    let read = super::skill_parse::read(path)?;
    let name = read
        .parsed
        .name
        .filter(|n| !n.is_empty())
        .or_else(|| {
            path.parent()?
                .file_name()
                .map(|n| n.to_string_lossy().into())
        })
        .unwrap_or_else(|| "Skill".into());
    Ok(SkillInput {
        name,
        description: read.parsed.description.unwrap_or_default(),
        source_type: "md".into(),
        content_md: Some(read.content),
        ..Default::default()
    })
}
/// Convert a GitHub blob path without altering other HTTP(S) sources.
pub fn remote_url(raw: &str) -> AppResult<reqwest::Url> {
    super::providers::validate_url(raw)?;
    let mut url = reqwest::Url::parse(raw).map_err(|_| AppError::Invalid("Invalid URL".into()))?;
    if url.host_str() == Some("github.com") {
        let parts = url
            .path_segments()
            .map(|s| s.collect::<Vec<_>>())
            .unwrap_or_default();
        if parts.len() >= 5 && parts[2] == "blob" {
            let path = format!("/{}/{}/{}", parts[0], parts[1], parts[3..].join("/"));
            url.set_host(Some("raw.githubusercontent.com"))
                .map_err(|_| AppError::Invalid("Invalid URL".into()))?;
            url.set_path(&path);
        }
    }
    Ok(url)
}
/// Fetch a user-selected source with a hard streamed one-MiB limit and safe diagnostics.
pub async fn fetch(client: &reqwest::Client, raw: &str) -> AppResult<String> {
    let url = remote_url(raw)?;
    tokio::time::timeout(std::time::Duration::from_secs(15), async {
        let response = client
            .get(url)
            .send()
            .await
            .map_err(|_| AppError::coded(ErrorCode::Network, "Cannot fetch Skill source"))?;
        if !response.status().is_success() {
            return Err(AppError::coded(
                ErrorCode::Network,
                "Skill source returned an unsuccessful status",
            ));
        }
        if response.content_length().is_some_and(|n| n > 1_048_576) {
            return Err(AppError::Invalid("Skill source exceeds 1 MiB".into()));
        }
        let mut bytes = vec![];
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk
                .map_err(|_| AppError::coded(ErrorCode::Network, "Skill download interrupted"))?;
            if bytes.len() + chunk.len() > 1_048_576 {
                return Err(AppError::Invalid("Skill source exceeds 1 MiB".into()));
            }
            bytes.extend_from_slice(&chunk);
        }
        String::from_utf8(bytes).map_err(|_| AppError::Invalid("Skill source must be UTF-8".into()))
    })
    .await
    .map_err(|_| AppError::coded(ErrorCode::Timeout, "Skill source timed out"))?
}
