use super::*;
use serde_json::json;
fn clock() -> NaiveDateTime {
    NaiveDateTime::parse_from_str("2026-10-20 14:30", "%Y-%m-%d %H:%M").unwrap()
}
fn preview(original: &str, items: Value) -> CapturePreview {
    build_preview(
        &json!({"items":items}).to_string(),
        &Context {
            original,
            forced: None,
            target: None,
            now: clock(),
            existing_tags: &["Work".into()],
            known_tools: &["Claude Code".into(), "Custom".into()],
        },
        false,
    )
    .unwrap()
}
fn one(original: &str, extra: Value) -> CapturePreview {
    let mut raw = json!({"type":"idea","source":"model rewrite","confidence":"high"});
    raw.as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());
    preview(original, json!([raw]))
}
#[test]
fn original_text_and_prompt_substrings_only() {
    assert_eq!(
        one("存个提示词：你是 编辑", json!({"type":"prompt","body":" "})).items[0].body,
        "存个提示词：你是 编辑"
    );
    let p = one("  原文\n逐字保留  ", json!({"body":"AI改写"}));
    assert_eq!(p.items[0].source, "  原文\n逐字保留  ");
    assert_eq!(p.items[0].body, p.items[0].source);
    for (body, expected) in [
        ("AI改写", "存个提示词：你是编辑"),
        (" ", "存个提示词：你是编辑"),
        ("你是编辑", "你是编辑"),
        ("", "存个提示词：你是编辑"),
    ] {
        assert_eq!(
            one("存个提示词：你是编辑", json!({"type":"prompt","body":body})).items[0].body,
            expected
        );
    }
}
#[test]
fn multiple_sources_reconstruct_original_whitespace_and_count_union() {
    let p = preview(
        "甲\n\t 乙；丙",
        json!([
            {"type":"idea","source":"甲 乙","confidence":"high"},
            {"type":"idea","source":"丙","confidence":"high"}
        ]),
    );
    assert_eq!(p.items[0].body, "甲\n\t 乙");
    assert!(!p.partial_coverage);
    let p = preview(
        "甲乙丙丁戊己庚辛壬癸",
        json!([
            {"type":"idea","source":"甲乙","confidence":"high"},
            {"type":"idea","source":"甲乙","confidence":"high"}
        ]),
    );
    assert!(p.partial_coverage && !p.auto_save_eligible);
    let p = preview("真正原文", json!([{"source":"模型伪造"},{"source":"真正"}]));
    assert!(
        p.items[0]
            .warnings
            .contains(&CaptureWarning::SourceMismatch)
    );
    assert_eq!(p.items[0].body, "真正原文");
    assert!(!p.auto_save_eligible);
}
#[test]
fn json_shape_limits_and_defaults() {
    let ctx = Context {
        original: "原文",
        forced: None,
        target: None,
        now: clock(),
        existing_tags: &[],
        known_tools: &[],
    };
    for raw in ["broken", "{}", "{\"items\":[]}", "{\"items\":{}}"] {
        assert!(matches!(
            build_preview(raw, &ctx, false).unwrap_err().code(),
            ErrorCode::AiBadResponse
        ));
    }
    let raw = "```json\n{\"items\":[{\"type\":\"unknown\",\"tools\":4,\"priority\":100}]}\n```";
    let p = build_preview(raw, &ctx, false).unwrap();
    assert_eq!(p.items[0].kind, EntityType::Idea);
    assert_eq!(p.items[0].priority, 2);
    assert!(p.items[0].warnings.contains(&CaptureWarning::LowConfidence));
    assert_eq!(preview("原文", json!(vec![json!({}); 12])).items.len(), 10);
    assert_eq!(preview("原文", json!([null])).items[0].body, "原文");
}
#[test]
fn url_allowlist_and_fallback() {
    let p = one(
        "教程 https://example.com/a",
        json!({"type":"tip","url":"https://evil.invalid"}),
    );
    assert!(p.items[0].url.is_none());
    assert!(p.items[0].warnings.contains(&CaptureWarning::UrlDropped));
    assert!(!p.auto_save_eligible);
    for kind in ["tip", "skill"] {
        assert_eq!(
            one("教程 https://example.com/a。", json!({"type":kind})).items[0]
                .url
                .as_deref(),
            Some("https://example.com/a")
        );
        assert!(
            one("https://a.test https://b.test", json!({"type":kind})).items[0]
                .url
                .is_none()
        );
        assert_eq!(
            one(
                "https://a.test",
                json!({"type":kind,"url":"https://a.test"})
            )
            .items[0]
                .url
                .as_deref(),
            Some("https://a.test")
        );
    }
}
#[test]
fn cleaning_and_frontmatter() {
    let p = one(
        "原文",
        json!({"type":"tip","title":"文".repeat(201),"tools":["claude code","evil","CLAUDE CODE","custom"],"tags":[" work ","WORK","a","b","c","d","e",4],"priority":4}),
    );
    let item = &p.items[0];
    assert_eq!(item.tools, ["Claude Code", "Custom"]);
    assert_eq!(item.tags, ["Work", "a", "b", "c", "d"]);
    assert_eq!(item.title.chars().count(), 200);
    assert!(item.warnings.contains(&CaptureWarning::TitleTruncated));
    assert_eq!(item.priority, 2);
    let raw = "---\nname: example\ndescription: 测试简介\n---\n# 原始内容";
    let p = one(raw, json!({"type":"skill"}));
    assert_eq!(p.items[0].skill_content.as_deref(), Some(raw));
    assert_eq!(p.items[0].title, "example");
    assert_eq!(p.items[0].description, "测试简介");
    assert!(
        one("---\n损坏", json!({"type":"skill"})).items[0]
            .skill_content
            .is_none()
    );
    let p = one(
        "明天前交材料",
        json!({"type":"todo","dateText":"明天前","title":"明天前交材料"}),
    );
    assert_eq!(p.items[0].title, "交材料");
    assert_eq!(p.items[0].body, "明天前交材料");
    assert!(
        one("整理书架", json!({"type":"todo","title":"整理书架"})).items[0]
            .body
            .is_empty()
    );
}
#[test]
fn prefix_forces_single_full_source_high_confidence() {
    let ctx = Context {
        original: "原始内容",
        forced: Some(EntityType::Todo),
        target: None,
        now: clock(),
        existing_tags: &[],
        known_tools: &[],
    };
    let p = build_preview(
        &json!({"items":[{"type":"idea","source":"编造","confidence":"low"},{"type":"tip"}]})
            .to_string(),
        &ctx,
        false,
    )
    .unwrap();
    assert_eq!(p.items.len(), 1);
    assert_eq!(p.items[0].kind, EntityType::Todo);
    assert_eq!(p.items[0].confidence, Confidence::High);
    assert_eq!(p.items[0].source, "原始内容");
    assert!(p.auto_save_eligible);
}
#[test]
fn date_rules_precedence_rollover_ai_and_forgery() {
    for (source, extra, date, from, warn) in [
        (
            "下周三下午3点前交材料",
            json!({"dateText":"下周三下午3点前","date":"2026-10-21","time":"04:00"}),
            Some("2026-10-28"),
            Some(DateSource::Rule),
            None,
        ),
        (
            "下午两点交材料",
            json!({"dateText":"下午两点"}),
            Some("2026-10-21"),
            Some(DateSource::Rule),
            Some(CaptureWarning::TimeRolledOver),
        ),
        (
            "下午3点交材料",
            json!({"dateText":"下午3点"}),
            Some("2026-10-20"),
            Some(DateSource::Rule),
            None,
        ),
        (
            "昨天交材料",
            json!({"dateText":"昨天"}),
            Some("2026-10-19"),
            Some(DateSource::Rule),
            Some(CaptureWarning::DatePast),
        ),
        (
            "年底前交材料",
            json!({"dateText":"年底前","date":"2026-12-31","time":"10:00"}),
            Some("2026-12-31"),
            Some(DateSource::Ai),
            Some(CaptureWarning::DateFromAi),
        ),
        (
            "年底前交材料",
            json!({"dateText":"年底前","date":"2040-12-31"}),
            None,
            None,
            Some(CaptureWarning::DateUnresolved),
        ),
        (
            "交材料",
            json!({"dateText":"明天","date":"2026-10-21"}),
            None,
            None,
            None,
        ),
        (
            "交材料",
            json!({"date":"2026-10-21","time":"10:00"}),
            None,
            None,
            None,
        ),
        (
            "年底前交材料",
            json!({"dateText":"年底前","date":"2026-02-30"}),
            None,
            None,
            Some(CaptureWarning::DateUnresolved),
        ),
    ] {
        let mut v = json!({"type":"todo","title":"交材料"});
        v.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        let p = one(source, v);
        let item = &p.items[0];
        assert_eq!(item.due_date.as_deref(), date, "{source}");
        assert_eq!(item.date_source, from, "{source}");
        if let Some(w) = warn {
            assert!(item.warnings.contains(&w), "{source}");
        }
        if from == Some(DateSource::Rule)
            && let Some(remind_at) = item.remind_at
        {
            let local = Local.timestamp_millis_opt(remind_at).unwrap();
            assert_eq!(
                local.format("%H:%M").to_string(),
                if source.contains("两点") {
                    "14:00"
                } else {
                    "15:00"
                }
            );
        }
    }
    for (phrase, expected) in [
        ("昨天", "2026-10-19"),
        ("明天", "2026-10-20"),
        ("2026-08-01", "2026-10-20"),
    ] {
        assert_eq!(
            one(phrase, json!({"dateText":phrase})).items[0]
                .date
                .as_deref(),
            Some(expected)
        );
    }
    for kind in ["tip", "skill", "prompt"] {
        let p = one("明天", json!({"type":kind,"dateText":"明天"}));
        assert!(
            p.items[0].date.is_none()
                && p.items[0].due_date.is_none()
                && p.items[0].date_source.is_none()
        );
    }
}
#[test]
fn auto_save_gates() {
    assert!(one("原文", json!({})).auto_save_eligible);
    for extra in [
        json!({"confidence":"low"}),
        json!({"type":"bad"}),
        json!({"url":"https://invented.test"}),
        json!({"type":"todo","dateText":"原文"}),
        json!({"type":"todo","dateText":"原文","date":"2026-12-31"}),
    ] {
        assert!(!one("原文", extra).auto_save_eligible);
    }
    assert!(
        !one(
            "明天",
            json!({"type":"todo","title":"明天","dateText":"明天"})
        )
        .auto_save_eligible
    );
    assert!(
        !one(
            "昨天",
            json!({"type":"todo","title":"提交","dateText":"昨天"})
        )
        .auto_save_eligible
    );
    assert!(
        !preview(
            "原文",
            json!(vec![
                json!({"source":"原文","type":"idea","confidence":"high"});
                6
            ])
        )
        .auto_save_eligible
    );
    let ctx = Context {
        original: "原文",
        forced: None,
        target: None,
        now: clock(),
        existing_tags: &[],
        known_tools: &[],
    };
    assert!(
        !build_preview(
            "{\"items\":[{\"type\":\"idea\",\"confidence\":\"high\"}]}",
            &ctx,
            true
        )
        .unwrap()
        .auto_save_eligible
    );
}

#[test]
fn explicit_target_splits_same_type_preserves_sources_and_limits_ten() {
    let original = "甲\n\t 乙 https://a.test；丙 https://b.test";
    let ctx = Context {
        original,
        forced: Some(EntityType::Todo),
        target: Some(EntityType::Skill),
        now: clock(),
        existing_tags: &[],
        known_tools: &[],
    };
    let raw = json!({"items":[
        {"type":"tip","source":"甲 乙 https://a.test","title":"A","confidence":"high"},
        {"type":"todo","source":"丙 https://b.test","title":"B","confidence":"high"}
    ]})
    .to_string();
    let p = build_preview(&raw, &ctx, false).unwrap();
    assert_eq!(p.items.len(), 2);
    assert!(p.items.iter().all(|i| i.kind == EntityType::Skill));
    assert_eq!(p.items[0].source, "甲\n\t 乙 https://a.test");
    assert_eq!(p.items[0].url.as_deref(), Some("https://a.test"));
    assert_eq!(p.items[1].source, "丙 https://b.test");
    assert!(!p.partial_coverage);
    assert!(p.auto_save_eligible);
    let many = json!({"items":vec![json!({"type":"idea","source":original,"title":"条目"});12]})
        .to_string();
    let p = build_preview(&many, &ctx, false).unwrap();
    assert_eq!(p.items.len(), 10);
    assert!(!p.auto_save_eligible);
}
#[test]
fn explicit_target_still_checks_coverage_forgery_and_single_source() {
    let ctx = Context {
        original: "甲乙丙丁戊己庚辛壬癸",
        forced: None,
        target: Some(EntityType::Prompt),
        now: clock(),
        existing_tags: &[],
        known_tools: &[],
    };
    for sources in [["甲乙", "甲乙"], ["编造", "甲乙"]] {
        let raw=json!({"items":sources.map(|s|json!({"type":"skill","source":s,"body":"伪造正文","url":"https://evil.test"}))}).to_string();
        let p = build_preview(&raw, &ctx, false).unwrap();
        assert!(p.partial_coverage && !p.auto_save_eligible);
        assert!(
            p.items.iter().all(|i| i.kind == EntityType::Prompt
                && i.url.is_none()
                && !i.body.contains("伪造"))
        );
        if sources[0] == "编造" {
            assert_eq!(p.items[0].source, ctx.original);
            assert!(
                p.items[0]
                    .warnings
                    .contains(&CaptureWarning::SourceMismatch)
            );
        }
    }
    let p = build_preview(
        &json!({"items":[{"type":"todo","source":"改写"}]}).to_string(),
        &ctx,
        false,
    )
    .unwrap();
    assert_eq!(p.items[0].source, ctx.original);
}

#[test]
fn link_title_needs_preview_and_multi_bodies_must_belong_to_their_source() {
    for kind in ["skill", "material"] {
        assert!(!one("https://a.test", json!({"type":kind})).auto_save_eligible);
    }
    for kind in [EntityType::Prompt, EntityType::Material] {
        let ctx = Context {
            original: "甲提示词；乙提示词",
            forced: None,
            target: Some(kind),
            now: clock(),
            existing_tags: &[],
            known_tools: &[],
        };
        let p=build_preview(&json!({"items":[{"source":"甲提示词","body":"乙提示词","prompt":"乙提示词"},{"source":"乙提示词","body":"乙提示词","prompt":"乙提示词"}]}).to_string(),&ctx,false).unwrap();
        assert_eq!(p.items[0].body, "甲提示词");
        assert!(p.items[0].material_prompt.is_empty());
        assert_eq!(p.items[1].body, "乙提示词");
    }
}
#[test]
fn explicit_target_does_not_make_uncertain_fields_reliable() {
    let ctx = Context {
        original: "模糊内容",
        forced: Some(EntityType::Todo),
        target: Some(EntityType::Idea),
        now: clock(),
        existing_tags: &[],
        known_tools: &[],
    };
    let p = build_preview(
        &json!({"items":[{"type":"todo","confidence":"low"}]}).to_string(),
        &ctx,
        false,
    )
    .unwrap();
    assert_eq!(p.items[0].kind, EntityType::Idea);
    assert_eq!(p.items[0].confidence, Confidence::Low);
    assert!(p.items[0].warnings.contains(&CaptureWarning::LowConfidence));
    assert!(!p.auto_save_eligible);
}
