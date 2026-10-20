use crate::domain::ai::ParsedAiResult;
/// Extract structured results for preview only; parsing never writes content.
pub fn result(action: &str, text: &str) -> ParsedAiResult {
    let mut result = ParsedAiResult {
        kind: match action {
            "title_tags" | "skill_describe" => "json",
            "polish" | "shorten" | "expand" | "optimize_prompt" => "rewrite",
            "extract_tip" => "tip_card",
            _ => "markdown",
        }
        .into(),
        text: text.into(),
        changes: None,
        title: None,
        description: None,
        tags: vec![],
        valid: true,
        todos: vec![],
    };
    if action == "breakdown_todos" {
        result.kind = "todos".into();
        result.todos = json(text)
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        result.valid = !result.todos.is_empty()
            && result.todos.len() <= 100
            && result.todos.iter().all(|t| !t.title.trim().is_empty());
    }
    if action == "optimize_prompt" {
        if let (Some(body), Some(changes)) = (block(text, "optimized"), block(text, "changes")) {
            result.text = body;
            result.changes = Some(changes);
        } else {
            result.valid = false;
        }
    }
    if result.kind == "json" {
        if let Some(v) = json(text) {
            result.title = v
                .get("title")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(str::to_string);
            result.description = v
                .get("description")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            if let Some(tags) = v.get("tags").and_then(|v| v.as_array()) {
                result.tags = tags
                    .iter()
                    .filter_map(|v| v.as_str())
                    .take(30)
                    .map(str::to_string)
                    .collect();
                result.valid = tags.iter().all(|v| v.is_string())
                    && (if action == "title_tags" {
                        result.title.is_some()
                    } else {
                        result.description.is_some()
                    });
            } else {
                result.valid = false;
            }
        } else {
            result.valid = false;
        }
    }
    if action == "extract_tip" {
        result.title = text
            .lines()
            .next()
            .and_then(|v| v.strip_prefix("# "))
            .map(str::to_string);
        result.valid = result.title.is_some();
    }
    result
}
fn block(text: &str, tag: &str) -> Option<String> {
    let start = text.find(&format!("<{tag}>"))? + tag.len() + 2;
    let rest = &text[start..];
    Some(rest[..rest.find(&format!("</{tag}>"))?].trim().into())
}
/// Find the first balanced JSON object/array while respecting quoted braces.
pub fn json(text: &str) -> Option<serde_json::Value> {
    let start = text.find(['{', '['])?;
    let mut depth = 0;
    let mut quoted = false;
    let mut escaped = false;
    for (offset, c) in text[start..].char_indices() {
        if quoted {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                quoted = false;
            }
        } else {
            match c {
                '"' => quoted = true,
                '{' | '[' => depth += 1,
                '}' | ']' => {
                    depth -= 1;
                    if depth == 0 {
                        return serde_json::from_str(&text[start..start + offset + c.len_utf8()])
                            .ok();
                    }
                }
                _ => {}
            }
        }
    }
    None
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tolerant_but_not_destructive() {
        assert_eq!(
            json("```json\n{\"title\":\"a } b\",\"tags\":[]}\n```\nextra").unwrap()["title"],
            "a } b"
        );
        assert!(!result("title_tags", "broken").valid);
        assert_eq!(
            result(
                "optimize_prompt",
                "<optimized>{{topic}}</optimized><changes>说明</changes>"
            )
            .text,
            "{{topic}}"
        );
    }
}
