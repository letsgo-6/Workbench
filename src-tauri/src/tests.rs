use crate::{
    commands, db,
    domain::{common::*, idea::*, prompt::*, skill::*, tip::*, todo::*},
    repo, services,
};
use rusqlite::{Connection, params};

fn database() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    db::migrate::run(&mut conn).unwrap();
    conn
}

#[test]
fn migration_is_atomic_and_repeated_start_is_safe() {
    let mut conn = database();
    db::migrate::run(&mut conn).unwrap();
    let version: i32 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap();
    assert_eq!(version, 2);
    let count:i32=conn.query_row("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('idea','todo','tip','skill','prompt','tag','entity_tag','ai_provider','setting')",[],|r|r.get(0)).unwrap();
    assert_eq!(count, 9);
}

#[test]
fn all_five_crud_tag_index_delete_restore_and_purge() {
    let mut conn = database();
    let tx = conn.transaction().unwrap();
    let tags = vec!["统计学习".into()];
    let idea = repo::ideas::create(
        &tx,
        &IdeaInput {
            content_md: "中文搜索灵感 keyword".into(),
            date: "2026-10-19".into(),
            tags: tags.clone(),
        },
        1,
        None,
    )
    .unwrap();
    let todo = repo::todos::create(
        &tx,
        &TodoInput {
            title: "中文搜索待办".into(),
            priority: 2,
            tags: tags.clone(),
            ..Default::default()
        },
        2,
        None,
    )
    .unwrap();
    let tip = repo::tips::create(
        &tx,
        &TipInput {
            title: "中文搜索技巧".into(),
            tools: vec!["Codex".into()],
            tags: tags.clone(),
            ..Default::default()
        },
        3,
        None,
    )
    .unwrap();
    let skill = repo::skills::create(
        &tx,
        &SkillInput {
            name: "中文搜索技能".into(),
            source_type: "md".into(),
            tags: tags.clone(),
            ..Default::default()
        },
        4,
        None,
    )
    .unwrap();
    let prompt = repo::prompts::create(
        &tx,
        &PromptInput {
            title: "中文搜索提示词".into(),
            body: "谈谈 {{topic}}".into(),
            tags,
            ..Default::default()
        },
        5,
        None,
    )
    .unwrap();
    assert_eq!(prompt.variables, vec!["topic"]);
    assert_eq!(repo::search::query(&tx, "中文搜索", 8).unwrap().len(), 5);
    assert_eq!(repo::search::query(&tx, "中文", 8).unwrap().len(), 5);
    repo::ideas::update(
        &tx,
        &idea.id,
        &IdeaInput {
            content_md: "替换后的文本".into(),
            date: "2026-10-19".into(),
            tags: vec!["新标签".into()],
        },
        6,
    )
    .unwrap();
    repo::todos::update(
        &tx,
        &todo.id,
        &TodoInput {
            title: "替换后的待办".into(),
            priority: 1,
            ..Default::default()
        },
        6,
    )
    .unwrap();
    repo::tips::update(
        &tx,
        &tip.id,
        &TipInput {
            title: "替换后的技巧".into(),
            ..Default::default()
        },
        6,
    )
    .unwrap();
    repo::skills::update(
        &tx,
        &skill.id,
        &SkillInput {
            name: "替换后的技能".into(),
            source_type: "md".into(),
            ..Default::default()
        },
        6,
    )
    .unwrap();
    repo::prompts::update(
        &tx,
        &prompt.id,
        &PromptInput {
            title: "替换后的提示词".into(),
            body: "{{主题}}".into(),
            ..Default::default()
        },
        6,
    )
    .unwrap();
    assert!(repo::search::query(&tx, "中文", 8).unwrap().is_empty());
    let refs = vec![
        EntityRef {
            entity_type: EntityType::Idea,
            id: idea.id,
        },
        EntityRef {
            entity_type: EntityType::Todo,
            id: todo.id,
        },
        EntityRef {
            entity_type: EntityType::Tip,
            id: tip.id,
        },
        EntityRef {
            entity_type: EntityType::Skill,
            id: skill.id,
        },
        EntityRef {
            entity_type: EntityType::Prompt,
            id: prompt.id,
        },
    ];
    for r in &refs {
        repo::common::mutate(&tx, r, "star", 7, true).unwrap();
        repo::common::mutate(&tx, r, "delete", 8, false).unwrap();
    }
    assert_eq!(repo::trash::list(&tx).unwrap().len(), 5);
    assert!(repo::search::query(&tx, "替换", 8).unwrap().is_empty());
    for r in &refs {
        repo::common::mutate(&tx, r, "restore", 9, false).unwrap();
    }
    assert_eq!(repo::search::query(&tx, "替换", 8).unwrap().len(), 5);
    for r in &refs {
        repo::common::mutate(&tx, r, "purge", 10, false).unwrap();
    }
    assert!(repo::search::query(&tx, "替换", 8).unwrap().is_empty());
    let links: i32 = tx
        .query_row("SELECT count(*) FROM entity_tag", [], |r| r.get(0))
        .unwrap();
    assert_eq!(links, 0);
    tx.commit().unwrap();
}

#[test]
fn rename_and_delete_tags_reindex_in_same_transaction() {
    let mut conn = database();
    let tx = conn.transaction().unwrap();
    let item = repo::ideas::create(
        &tx,
        &IdeaInput {
            content_md: "笔记".into(),
            date: "2026-10-19".into(),
            tags: vec!["旧标签".into(), "旧标签".into()],
        },
        1,
        None,
    )
    .unwrap();
    assert_eq!(item.tags.len(), 1);
    let tag = &item.tags[0];
    repo::tags::change(&tx, &tag.id, Some("新标签"), None, false, 2).unwrap();
    assert!(repo::search::query(&tx, "旧标签", 8).unwrap().is_empty());
    assert_eq!(repo::search::query(&tx, "新标签", 8).unwrap().len(), 1);
    repo::tags::change(&tx, &tag.id, None, None, true, 3).unwrap();
    assert!(repo::search::query(&tx, "新标签", 8).unwrap().is_empty());
    assert!(repo::ideas::get(&tx, &item.id).unwrap().tags.is_empty());
}

#[test]
fn todo_views_include_carryovers_and_use_half_open_completion_day() {
    let mut conn = database();
    let tx = conn.transaction().unwrap();
    let today = "2026-10-19";
    for (day, status, completed) in [
        (Some("2026-10-18"), "todo", None),
        (Some(today), "todo", None),
        (Some("2026-10-25"), "todo", None),
        (Some("2026-10-26"), "todo", None),
        (None, "todo", None),
        (Some("2026-10-18"), "done", Some(100)),
        (Some(today), "done", Some(200)),
    ] {
        let item = repo::todos::create(
            &tx,
            &TodoInput {
                title: "test".into(),
                priority: 2,
                due_date: day.map(String::from),
                ..Default::default()
            },
            1,
            None,
        )
        .unwrap();
        tx.execute(
            "UPDATE todo SET status=?,completed_at=? WHERE id=?",
            params![status, completed, item.id],
        )
        .unwrap();
    }
    let list = |view: &str| {
        repo::todos::list(
            &tx,
            &ListQuery {
                view: Some(view.into()),
                ..Default::default()
            },
            today,
            100,
            200,
        )
        .unwrap()
    };
    assert_eq!(list("today").total, 3);
    assert_eq!(list("next7").total, 2);
    assert_eq!(list("all").total, 5);
    assert_eq!(list("done").total, 2);
}

#[test]
fn short_search_escapes_wildcards_and_unicode_snippets_are_safe() {
    let mut conn = database();
    let tx = conn.transaction().unwrap();
    for content in [
        "搜索 中文内容 %_ 你好世界",
        "unrelated ordinary",
        "quote \"marker\" and foo",
    ] {
        repo::ideas::create(
            &tx,
            &IdeaInput {
                content_md: content.into(),
                date: "2026-10-19".into(),
                tags: vec![],
            },
            1,
            None,
        )
        .unwrap();
    }
    assert_eq!(repo::search::query(&tx, "%_", 8).unwrap().len(), 1);
    assert_eq!(repo::search::query(&tx, "中文 世界", 8).unwrap().len(), 1);
    assert_eq!(repo::search::query(&tx, "\"marker\"", 8).unwrap().len(), 1);
}

#[test]
fn transaction_failure_rolls_back_entity_and_search() {
    let dir = tempfile::tempdir().unwrap();
    let db = db::Db::open(&dir.path().join("test.db"), dir.path()).unwrap();
    let result: crate::error::AppResult<()> = db.with_tx(|tx| {
        repo::ideas::create(
            tx,
            &IdeaInput {
                content_md: "rollback marker".into(),
                date: "2026-10-19".into(),
                tags: vec![],
            },
            1,
            None,
        )?;
        Err(crate::error::AppError::Invalid("test".into()))
    });
    assert!(result.is_err());
    assert!(
        db.with_conn(|c| repo::search::query(c, "marker", 8))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn retention_and_settings_validation() {
    let mut conn = database();
    let tx = conn.transaction().unwrap();
    let item = repo::ideas::create(
        &tx,
        &IdeaInput {
            content_md: "old".into(),
            date: "2026-10-19".into(),
            tags: vec![],
        },
        1,
        None,
    )
    .unwrap();
    let r = EntityRef {
        entity_type: EntityType::Idea,
        id: item.id,
    };
    repo::common::mutate(&tx, &r, "delete", 1, false).unwrap();
    repo::trash::cleanup(&tx, 30 * 86400000).unwrap();
    assert_eq!(repo::trash::list(&tx).unwrap().len(), 1);
    repo::trash::cleanup(&tx, 31 * 86400000).unwrap();
    assert!(repo::trash::list(&tx).unwrap().is_empty());
    assert!(repo::settings::set(&tx, "unknown", &serde_json::json!(true)).is_err());
    assert!(repo::settings::set(&tx, "appearance.theme", &serde_json::json!("invalid")).is_err());
    assert_eq!(
        repo::settings::set(&tx, "appearance.theme", &serde_json::json!("dark"))
            .unwrap()
            .appearance_theme,
        "dark"
    );
}

#[test]
fn template_shared_fixtures() {
    let cases: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/template_cases.json")).unwrap();
    for case in cases.as_array().unwrap() {
        let body = case["body"].as_str().unwrap();
        let vars: Vec<String> = serde_json::from_value(case["variables"].clone()).unwrap();
        let values = serde_json::from_value(case["values"].clone()).unwrap();
        assert_eq!(services::template::variables(body), vars);
        assert_eq!(
            services::template::render(body, &values),
            case["result"].as_str().unwrap()
        );
    }
}

#[test]
fn skill_frontmatter_file_constraints_and_export() {
    assert!(
        !services::skill_parse::parse("# Markdown")
            .unwrap()
            .has_frontmatter
    );
    let parsed = services::skill_parse::parse(
        "---\r\nname: Test\r\ndescription: |\r\n  line one\r\n  line two\r\n---\r\n# Body",
    )
    .unwrap();
    assert_eq!(parsed.name.as_deref(), Some("Test"));
    assert_eq!(parsed.description.as_deref(), Some("line one\nline two"));
    assert!(services::skill_parse::parse("---\nname: [broken\n---\n").is_err());
    assert!(services::skill_parse::parse("---\nname: Test").is_err());
    let dir = tempfile::tempdir().unwrap();
    let txt = dir.path().join("file.txt");
    std::fs::write(&txt, "text").unwrap();
    assert!(services::skill_parse::read(&txt).is_err());
    assert_eq!(services::export::filename("CON"), "CON_");
    assert_eq!(services::export::filename("a<b>:c?"), "abc");
    let mut conn = database();
    let tx = conn.transaction().unwrap();
    let item = repo::skills::create(
        &tx,
        &SkillInput {
            name: "Test".into(),
            description: "简介".into(),
            source_type: "md".into(),
            content_md: Some("# Body".into()),
            ..Default::default()
        },
        1,
        None,
    )
    .unwrap();
    let path = services::export::skill(&item, dir.path(), true).unwrap();
    assert_eq!(path.file_name().unwrap(), "SKILL.md");
    let read = services::skill_parse::read(&path).unwrap();
    assert_eq!(read.parsed.name.as_deref(), Some("Test"));
    assert!(read.content.contains("# Body"));
}

#[test]
fn validation_rejects_bad_dates_urls_titles_and_ratings() {
    assert!(commands::validate(&serde_json::json!({"date":"2026-02-30"})).is_err());
    assert!(commands::validate(&serde_json::json!({"url":"javascript:alert(1)"})).is_err());
    assert!(commands::prepare_todo(&mut TodoInput::default()).is_err());
    assert!(
        commands::prepare_skill(&mut SkillInput {
            rating: Some(6),
            ..Default::default()
        })
        .is_err()
    );
}

#[test]
fn ten_thousand_mixed_records_search_budget() {
    let mut conn = database();
    let tx = conn.transaction().unwrap();
    for index in 0..10000 {
        let text = format!("统计分析 sample knowledge item {index}");
        match index % 5 {
            0 => {
                repo::ideas::create(
                    &tx,
                    &IdeaInput {
                        content_md: text,
                        date: "2026-10-19".into(),
                        tags: vec![],
                    },
                    index,
                    None,
                )
                .unwrap();
            }
            1 => {
                repo::todos::create(
                    &tx,
                    &TodoInput {
                        title: text,
                        priority: 2,
                        ..Default::default()
                    },
                    index,
                    None,
                )
                .unwrap();
            }
            2 => {
                repo::tips::create(
                    &tx,
                    &TipInput {
                        title: text,
                        ..Default::default()
                    },
                    index,
                    None,
                )
                .unwrap();
            }
            3 => {
                repo::skills::create(
                    &tx,
                    &SkillInput {
                        name: text,
                        source_type: "md".into(),
                        ..Default::default()
                    },
                    index,
                    None,
                )
                .unwrap();
            }
            _ => {
                repo::prompts::create(
                    &tx,
                    &PromptInput {
                        title: text,
                        ..Default::default()
                    },
                    index,
                    None,
                )
                .unwrap();
            }
        }
    }
    tx.commit().unwrap();
    for keyword in ["统计", "统计分析", "knowledge item", "%_"] {
        let start = std::time::Instant::now();
        let hits = repo::search::query(&conn, keyword, 8).unwrap();
        let elapsed = start.elapsed();
        println!(
            "search 10000 records / {keyword}: {elapsed:?} / {} hits",
            hits.len()
        );
        if keyword != "%_" {
            assert_eq!(hits.len(), 40);
        }
        if !cfg!(debug_assertions) {
            assert!(
                elapsed < std::time::Duration::from_millis(200),
                "{keyword}: {elapsed:?}"
            );
        }
    }
}
