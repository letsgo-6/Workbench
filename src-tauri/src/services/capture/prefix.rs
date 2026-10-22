use crate::domain::common::EntityType;

/// Detect an explicit type followed by a colon or whitespace.
pub fn detect(text: &str) -> Option<(EntityType, &str)> {
    let text = text.trim_start();
    for (kind, prefixes) in [
        (EntityType::Idea, &["灵感", "想法"][..]),
        (EntityType::Todo, &["待办", "任务", "todo"][..]),
        (EntityType::Tip, &["技巧", "tip"][..]),
        (EntityType::Skill, &["skill"][..]),
        (EntityType::Prompt, &["提示词", "prompt"][..]),
        (EntityType::Material, &["作品", "素材", "组件"][..]),
    ] {
        for prefix in prefixes {
            if let Some(head) = text.get(..prefix.len())
                && head.eq_ignore_ascii_case(prefix)
                && let Some(rest) = text.get(prefix.len()..)
                && rest.starts_with(|c: char| c == ':' || c == '：' || c.is_whitespace())
            {
                return Some((kind, rest.trim_start_matches([':', '：']).trim()));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn prefix_table() {
        for (text, kind, body) in [
            ("灵感：想法", EntityType::Idea, "想法"),
            ("想法: 正文", EntityType::Idea, "正文"),
            ("  待办：整理", EntityType::Todo, "整理"),
            ("任务 整理", EntityType::Todo, "整理"),
            ("ToDo: 整理", EntityType::Todo, "整理"),
            ("技巧：/compact", EntityType::Tip, "/compact"),
            ("TIP\t正文", EntityType::Tip, "正文"),
            ("SKILL：链接", EntityType::Skill, "链接"),
            ("提示词：你是{{topic}}", EntityType::Prompt, "你是{{topic}}"),
            ("Prompt: write", EntityType::Prompt, "write"),
        ] {
            assert_eq!(detect(text), Some((kind, body)), "{text}");
        }
        for text in ["灵感爆发了", "skillful", "todo", "随便说", "prompting:"] {
            assert_eq!(detect(text), None, "{text}");
        }
    }
}
