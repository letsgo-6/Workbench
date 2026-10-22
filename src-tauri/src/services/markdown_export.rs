use crate::{
    domain::common::{EntityType, Tag},
    error::{AppError, AppResult},
    repo,
};
use rusqlite::Connection;
use std::{collections::BTreeMap, io::Write, path::Path};
fn write(dir: &Path, name: &str, body: &str, metadata: serde_json::Value) -> AppResult<()> {
    std::fs::create_dir_all(dir)?;
    let mut meta =
        serde_yaml_ng::to_value(metadata).map_err(|e| AppError::Invalid(e.to_string()))?;
    let normalized = body.replace("\r\n", "\n");
    let mut content = normalized.as_str();
    if let Some(rest) = normalized.strip_prefix("---\n")
        && let Some((front, tail)) = rest.split_once("\n---\n")
        && let Ok(serde_yaml_ng::Value::Mapping(original)) =
            serde_yaml_ng::from_str::<serde_yaml_ng::Value>(front)
        && let Some(map) = meta.as_mapping_mut()
    {
        for (key, value) in original {
            map.entry(key).or_insert(value);
        }
        content = tail.trim_start_matches('\n');
    }
    let yaml = serde_yaml_ng::to_string(&meta).map_err(|e| AppError::Invalid(e.to_string()))?;
    let output = format!("---\n{yaml}---\n\n{content}\n");
    let stem = super::export::filename(name);
    for n in 1..10000 {
        let name = if n == 1 {
            format!("{stem}.md")
        } else {
            format!("{stem}-{n}.md")
        };
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dir.join(name))
        {
            Ok(mut file) => {
                file.write_all(output.as_bytes())?;
                return Ok(());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(AppError::Invalid("Too many duplicate export names".into()))
}
fn meta(tags: &[Tag], created: i64, updated: i64) -> serde_json::Value {
    serde_json::json!({"tags":tags.iter().map(|t|t.name.clone()).collect::<Vec<_>>(),"created":chrono::DateTime::from_timestamp_millis(created).map(|d|d.to_rfc3339()),"updated":chrono::DateTime::from_timestamp_millis(updated).map(|d|d.to_rfc3339())})
}
/// Export live content into a portable Markdown tree without overwriting existing files.
pub fn export(conn: &Connection, dir: &Path) -> AppResult<u32> {
    export_inner(conn, dir, None)
}
/// Export materials with their original local media.
pub fn export_with_assets(conn: &Connection, dir: &Path, assets: &Path) -> AppResult<u32> {
    export_inner(conn, dir, Some(assets))
}
fn export_inner(conn: &Connection, dir: &Path, assets: Option<&Path>) -> AppResult<u32> {
    let mut count = 0;
    let mut days: BTreeMap<String, Vec<crate::domain::idea::Idea>> = BTreeMap::new();
    let mut todos = vec![];
    for kind in EntityType::ALL {
        let extra = if kind == EntityType::Prompt {
            " AND is_system_template=0"
        } else {
            ""
        };
        let ids = conn
            .prepare(&format!(
                "SELECT id FROM {} WHERE deleted_at IS NULL{extra} ORDER BY created_at,id",
                kind.table()
            ))?
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        for id in ids {
            match kind {
                EntityType::Material => {
                    count += export_material(conn, &id, dir, assets)?;
                }
                EntityType::Idea => {
                    let i = repo::ideas::get(conn, &id)?;
                    days.entry(i.date.clone()).or_default().push(i);
                }
                EntityType::Todo => todos.push(repo::todos::get(conn, &id)?),
                EntityType::Tip => {
                    let i = repo::tips::get(conn, &id)?;
                    write(
                        &dir.join("Agent技巧"),
                        &i.title,
                        &i.content_md,
                        meta(&i.tags, i.created_at, i.updated_at),
                    )?;
                    count += 1;
                }
                EntityType::Prompt => {
                    let i = repo::prompts::get(conn, &id)?;
                    write(
                        &dir.join("提示词"),
                        &i.title,
                        &i.body,
                        meta(&i.tags, i.created_at, i.updated_at),
                    )?;
                    count += 1;
                }
                EntityType::Skill => {
                    let i = repo::skills::get(conn, &id)?;
                    let base = dir.join("Skills");
                    std::fs::create_dir_all(&base)?;
                    let stem = super::export::filename(&i.name);
                    let mut n = 1;
                    let folder = loop {
                        let path = base.join(if n == 1 {
                            stem.clone()
                        } else {
                            format!("{stem}-{n}")
                        });
                        match std::fs::create_dir(&path) {
                            Ok(()) => break path,
                            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => n += 1,
                            Err(e) => return Err(e.into()),
                        }
                    };
                    let mut metadata = meta(&i.tags, i.created_at, i.updated_at);
                    metadata["name"] = i.name.into();
                    metadata["description"] = i.description.into();
                    write(
                        &folder,
                        "SKILL",
                        i.content_md.as_deref().unwrap_or(""),
                        metadata,
                    )?;
                    count += 1;
                }
            }
        }
    }
    for (date, items) in days {
        let tags = items
            .iter()
            .flat_map(|i| i.tags.clone())
            .collect::<Vec<_>>();
        let body = items
            .iter()
            .map(|i| i.content_md.clone())
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");
        write(
            &dir.join("灵感"),
            &date,
            &body,
            meta(
                &tags,
                items.iter().map(|i| i.created_at).min().unwrap_or(0),
                items.iter().map(|i| i.updated_at).max().unwrap_or(0),
            ),
        )?;
        count += 1;
    }
    let tags = todos
        .iter()
        .flat_map(|i| i.tags.clone())
        .collect::<Vec<_>>();
    let mut body = String::new();
    for parent in todos.iter().filter(|i| i.parent_id.is_none()) {
        body.push_str(&format!(
            "- [{}] {}{}\n{}\n",
            if parent.status == "done" { "x" } else { " " },
            parent.title,
            parent
                .due_date
                .as_ref()
                .map(|d| format!(" · {d}"))
                .unwrap_or_default(),
            parent.note_md
        ));
        for child in todos
            .iter()
            .filter(|i| i.parent_id.as_deref() == Some(&parent.id))
        {
            body.push_str(&format!(
                "  - [{}] {}\n",
                if child.status == "done" { "x" } else { " " },
                child.title
            ));
        }
    }
    write(
        dir,
        "待办",
        &body,
        meta(
            &tags,
            todos.iter().map(|i| i.created_at).min().unwrap_or(0),
            todos.iter().map(|i| i.updated_at).max().unwrap_or(0),
        ),
    )?;
    Ok(count + 1)
}

fn export_material(
    conn: &Connection,
    id: &str,
    dir: &Path,
    assets: Option<&Path>,
) -> AppResult<u32> {
    let item = repo::materials::get(conn, id)?;
    let base = dir.join("作品素材库").join(if item.kind == "work" {
        "作品"
    } else {
        "UI组件"
    });
    std::fs::create_dir_all(&base)?;
    let stem = super::export::filename(&item.title);
    let folder = (1..10000)
        .find_map(|n| {
            let path = base.join(if n == 1 {
                stem.clone()
            } else {
                format!("{stem}-{n}")
            });
            match std::fs::create_dir(&path) {
                Ok(()) => Some(Ok(path)),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => None,
                Err(e) => Some(Err(AppError::from(e))),
            }
        })
        .ok_or_else(|| AppError::Invalid("Too many duplicate folders".into()))??;
    let mut body = item.note_md.clone();
    if let Some(root) = assets {
        for asset in &item.assets {
            let source = super::assets::owned_path(root, &asset.path)?;
            if !source.is_file() {
                continue;
            }
            let name = super::export::filename(&asset.original_name);
            let original = Path::new(&name);
            let stem = original
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("material");
            let ext = original
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("bin");
            let target = (1..10000)
                .map(|n| {
                    folder.join(if n == 1 {
                        name.clone()
                    } else {
                        format!("{stem}-{n}.{ext}")
                    })
                })
                .find(|p| !p.exists())
                .ok_or_else(|| AppError::Invalid("Too many duplicate files".into()))?;
            let mut output = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)?;
            std::io::copy(&mut std::fs::File::open(source)?, &mut output)?;
            let name = target
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .replace(' ', "%20")
                .replace('(', "%28")
                .replace(')', "%29");
            body.push_str(&format!(
                "\n\n{}[{}](<./{}>)",
                if asset.media_kind == "video" { "" } else { "!" },
                asset.original_name.replace(['[', ']'], ""),
                name
            ));
        }
    }
    let mut metadata = meta(&item.tags, item.created_at, item.updated_at);
    metadata["url"] = serde_json::to_value(&item.url)?;
    write(
        &folder,
        if item.kind == "work" {
            "index"
        } else {
            "README"
        },
        &body,
        metadata.clone(),
    )?;
    if item.kind == "component" {
        write(&folder, "prompt", &item.prompt, metadata)?;
        Ok(2)
    } else {
        Ok(1)
    }
}
