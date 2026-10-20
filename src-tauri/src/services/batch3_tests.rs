use crate::{
    db::{self, Db},
    domain::{ai::*, common::*, prompt::PromptInput, todo::TodoInput},
    repo,
    services::*,
};
use rusqlite::Connection;
fn database(dir: &std::path::Path) -> Db {
    std::fs::create_dir_all(dir.join("backups")).unwrap();
    Db::open(&dir.join("workbench.db"), &dir.join("backups")).unwrap()
}
fn todo(title: &str) -> TodoInput {
    TodoInput {
        title: title.into(),
        priority: 2,
        ..Default::default()
    }
}
#[test]
fn v1_migration_preserves_data_and_runs_once() {
    let mut c = Connection::open_in_memory().unwrap();
    c.execute_batch(include_str!("../../migrations/0001_init.sql"))
        .unwrap();
    c.pragma_update(None, "user_version", 1).unwrap();
    c.execute(
        "INSERT INTO todo(id,title,created_at,updated_at) VALUES ('old','旧待办',1,2)",
        [],
    )
    .unwrap();
    db::migrate::run(&mut c).unwrap();
    db::migrate::run(&mut c).unwrap();
    let row = repo::todos::get(&c, "old").unwrap();
    assert_eq!(row.title, "旧待办");
    assert!(row.remind_at.is_none());
    assert_eq!(
        c.query_row(
            "SELECT count(*) FROM pragma_table_info('todo') WHERE name='remind_at'",
            [],
            |r| r.get::<_, u32>(0)
        )
        .unwrap(),
        1
    );
    assert_eq!(
        c.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
            .unwrap(),
        2
    );
}
#[test]
fn subtasks_one_level_progress_cascade_restore_and_purge() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path());
    db.with_tx(|tx| {
        let p = repo::todos::create(tx, &todo("父待办"), 10, None)?;
        let mut input = todo("子待办");
        input.parent_id = Some(p.id.clone());
        let child = repo::todos::create(tx, &input, 11, None)?;
        input.parent_id = Some(child.id.clone());
        assert!(repo::todos::create(tx, &input, 12, None).is_err());
        tx.execute("UPDATE todo SET status='done' WHERE id=?", [&child.id])?;
        let p = repo::todos::get(tx, &p.id)?;
        assert_eq!((p.subtask_done, p.subtask_total), (1, 1));
        input.parent_id = Some(p.id.clone());
        input.title = "修改后的子任务".into();
        repo::todos::update(tx, &child.id, &input, 13)?;
        let r = EntityRef {
            entity_type: EntityType::Todo,
            id: p.id.clone(),
        };
        repo::common::mutate(tx, &r, "delete", 20, false)?;
        assert!(repo::todos::get(tx, &child.id).is_err());
        assert_eq!(repo::trash::list(tx)?.len(), 1);
        repo::common::mutate(tx, &r, "restore", 21, false)?;
        assert_eq!(repo::todos::get(tx, &child.id)?.title, "修改后的子任务");
        repo::common::mutate(
            tx,
            &EntityRef {
                entity_type: EntityType::Todo,
                id: child.id.clone(),
            },
            "delete",
            22,
            false,
        )?;
        repo::common::mutate(tx, &r, "delete", 23, false)?;
        repo::common::mutate(tx, &r, "restore", 24, false)?;
        assert!(repo::todos::get(tx, &child.id).is_err());
        repo::common::mutate(tx, &r, "purge", 25, false)?;
        assert_eq!(
            tx.query_row("SELECT count(*) FROM todo", [], |r| r.get::<_, u32>(0))?,
            0
        );
        assert!(repo::search::query(tx, "子待办", 8)?.is_empty());
        Ok(())
    })
    .unwrap();
}
#[test]
fn prompt_versions_session_dedup_fifty_limit_and_restoration_snapshot() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path());
    db.with_tx(|tx| {
        let mut input = PromptInput {
            title: "提示".into(),
            body: "第一版".into(),
            ..Default::default()
        };
        let p = repo::prompts::create(tx, &input, 1, None)?;
        let first = repo::versions::create(tx, &p.id, 2, false)?.unwrap();
        for n in 3..20 {
            input.body = format!("草稿{n}");
            repo::prompts::update(tx, &p.id, &input, n)?;
        }
        assert_eq!(repo::versions::list(tx, &p.id)?.len(), 1);
        repo::versions::create(tx, &p.id, 21, false)?;
        assert!(repo::versions::create(tx, &p.id, 22, false)?.is_none());
        let restored = repo::versions::restore(tx, &first.id, 23)?;
        assert_eq!(restored.body, "第一版");
        assert_eq!(repo::versions::list(tx, &p.id)?.len(), 3);
        for n in 30..90 {
            input.body = format!("会话{n}");
            repo::prompts::update(tx, &p.id, &input, n)?;
            repo::versions::create(tx, &p.id, n, false)?;
        }
        let versions = repo::versions::list(tx, &p.id)?;
        assert_eq!(versions.len(), 50);
        assert_eq!(versions[0].body, "会话89");
        Ok(())
    })
    .unwrap();
}
#[test]
fn reminders_local_default_disabled_retry_and_no_duplicates() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path());
    let id = db
        .with_tx(|tx| {
            let mut input = todo("提醒");
            input.remind_at = Some(1000);
            Ok(repo::todos::create(tx, &input, 1, None)?.id)
        })
        .unwrap();
    assert_eq!(
        reminders::dispatch(&db, 999, |_| panic!("too early")).unwrap(),
        0
    );
    assert!(
        reminders::dispatch(&db, 1000, |_| Err(crate::error::AppError::Invalid(
            "not allowed".into()
        )))
        .is_err()
    );
    assert!(
        db.with_conn(|c| repo::todos::get(c, &id))
            .unwrap()
            .reminded_at
            .is_none()
    );
    let mut sends = 0;
    assert_eq!(
        reminders::dispatch(&db, 1000, |_| {
            sends += 1;
            Ok(())
        })
        .unwrap(),
        1
    );
    assert_eq!(
        reminders::dispatch(&db, 2000, |_| panic!("duplicate")).unwrap(),
        0
    );
    assert_eq!(sends, 1);
    db.with_tx(|tx| {
        repo::settings::set(tx, "todo.remindersEnabled", &false.into())?;
        let mut input = todo("日期提醒");
        input.due_date = Some("2026-10-19".into());
        repo::todos::create(tx, &input, 1, None)?;
        Ok(())
    })
    .unwrap();
    assert_eq!(
        reminders::dispatch(&db, i64::MAX, |_| panic!("disabled")).unwrap(),
        0
    );
    let item = db
        .with_conn(|c| repo::todos::list(c, &ListQuery::default(), "2026-10-19", 0, 1))
        .unwrap()
        .items
        .into_iter()
        .find(|t| t.title == "日期提醒")
        .unwrap();
    use chrono::TimeZone;
    let expected = chrono::Local
        .with_ymd_and_hms(2026, 10, 19, 9, 0, 0)
        .earliest()
        .unwrap()
        .timestamp_millis();
    assert_eq!(reminders::effective(&item, "09:00"), Some(expected));
}
#[test]
fn saved_chat_resolves_two_references_bounds_context_and_survives_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path());
    let id = uuid::Uuid::now_v7().to_string();
    let refs = db
        .with_tx(|tx| {
            let mut refs = vec![];
            for body in ["苹果分析", "香蕉观察"] {
                let item = repo::ideas::create(
                    tx,
                    &crate::domain::idea::IdeaInput {
                        content_md: body.into(),
                        date: "2026-10-19".into(),
                        tags: vec![],
                    },
                    1,
                    None,
                )?;
                refs.push(EntityRef {
                    entity_type: EntityType::Idea,
                    id: item.id,
                });
            }
            Ok(refs)
        })
        .unwrap();
    let input = AiChatInput {
        request_id: uuid::Uuid::now_v7().to_string(),
        provider_id: None,
        conversation_id: Some(id.clone()),
        messages: vec![ChatMessage {
            role: "user".into(),
            content: "比较两条 local-secret".into(),
        }],
        refs,
    };
    let (messages, _) = db
        .with_tx(|tx| ai::chat::prepare(tx, &input, &id, "provider", "local-secret", 2))
        .unwrap();
    let context = messages
        .iter()
        .map(|m| m.content.clone())
        .collect::<String>();
    assert!(context.contains("苹果分析") && context.contains("香蕉观察"));
    assert!(!context.contains("local-secret"));
    db.with_tx(|tx| {
        repo::conversations::append(tx, &id, "assistant", "已完成比较", &[], 3)?;
        repo::conversations::change(tx, &id, Some("水果对比"), 4)
    })
    .unwrap();
    let db2 = database(dir.path());
    let saved = db2.with_conn(|c| repo::conversations::get(c, &id)).unwrap();
    assert_eq!(saved.messages.len(), 2);
    assert_eq!(saved.messages[0].refs.len(), 2);
    assert_eq!(saved.conversation.title, "水果对比");
    let mut follow = input.clone();
    follow.messages[0].content = "长".repeat(5000);
    follow.refs.clear();
    let (messages, cut) = db
        .with_tx(|tx| {
            repo::settings::set(tx, "ai.maxInputChars", &1000.into())?;
            ai::chat::prepare(tx, &follow, &id, "provider", "local-secret", 5)
        })
        .unwrap();
    assert!(cut);
    assert!(
        messages
            .iter()
            .map(|m| m.content.chars().count())
            .sum::<usize>()
            <= 1000
    );
    assert!(messages[0].content.contains("苹果分析"));
    db.with_tx(|tx| repo::conversations::change(tx, &id, None, 6))
        .unwrap();
    assert!(db.with_conn(repo::conversations::list).unwrap().is_empty());
}
#[test]
fn chat_redaction_expansion_still_respects_input_budget() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path());
    db.with_tx(|tx| {
        repo::settings::set(tx, "ai.maxInputChars", &1000.into())?;
        let item = repo::ideas::create(
            tx,
            &crate::domain::idea::IdeaInput {
                content_md: "a".repeat(2000),
                date: "2026-10-19".into(),
                tags: vec![],
            },
            1,
            None,
        )?;
        let input = AiChatInput {
            request_id: uuid::Uuid::now_v7().to_string(),
            provider_id: None,
            conversation_id: None,
            messages: vec![ChatMessage {
                role: "user".into(),
                content: "question".into(),
            }],
            refs: vec![EntityRef {
                entity_type: EntityType::Idea,
                id: item.id,
            }],
        };
        let (messages, truncated) =
            ai::chat::prepare(tx, &input, "conversation", "provider", "a", 2)?;
        assert!(truncated);
        assert!(
            messages
                .iter()
                .map(|m| m.content.chars().count())
                .sum::<usize>()
                <= 1000
        );
        Ok(())
    })
    .unwrap();
}
#[test]
fn json_v2_roundtrip_new_tables_and_v1_upgrade() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path());
    db.with_tx(|tx| {
        ai::actions::seed_system_templates(tx)?;
        let p = repo::prompts::create(
            tx,
            &PromptInput {
                title: "历史".into(),
                body: "版本正文".into(),
                ..Default::default()
            },
            1,
            None,
        )?;
        repo::versions::create(tx, &p.id, 2, false)?;
        repo::conversations::begin(tx, "conv", "provider", "hello", &[], 3)?;
        repo::conversations::append(tx, "conv", "assistant", "world", &[], 4)?;
        repo::conversations::change(tx, "conv", None, 5)?;
        let mut input = todo("提醒待办");
        input.remind_at = Some(5000);
        repo::todos::create(tx, &input, 6, None)?;
        Ok(())
    })
    .unwrap();
    let original = serde_json::to_value(db.with_conn(data::export).unwrap()).unwrap();
    assert_eq!(original["schemaVersion"], 2);
    assert_eq!(original["formatVersion"], 1);
    let path = dir.path().join("v2.json");
    std::fs::write(&path, serde_json::to_vec(&original).unwrap()).unwrap();
    let target = tempfile::tempdir().unwrap();
    let other = database(target.path());
    let backup = other.with_conn(|c| data::read(c, &path)).unwrap();
    other
        .with_tx(|tx| data::apply(tx, &backup, "overwrite"))
        .unwrap();
    assert_eq!(
        original["data"],
        serde_json::to_value(other.with_conn(data::export).unwrap()).unwrap()["data"]
    );
    assert_eq!(
        other
            .with_tx(|tx| data::apply(tx, &backup, "merge"))
            .unwrap()
            .inserted,
        0
    );
    let mut legacy = original.clone();
    legacy["schemaVersion"] = 1.into();
    let map = legacy["data"].as_object_mut().unwrap();
    for key in ["promptVersions", "aiConversations", "aiMessages"] {
        map.remove(key);
    }
    for row in map["todos"].as_array_mut().unwrap() {
        row.as_object_mut().unwrap().remove("remind_at");
        row.as_object_mut().unwrap().remove("reminded_at");
    }
    std::fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();
    let v1 = other.with_conn(|c| data::read(c, &path)).unwrap();
    other
        .with_tx(|tx| data::apply(tx, &v1, "overwrite"))
        .unwrap();
    let after = serde_json::to_value(other.with_conn(data::export).unwrap()).unwrap();
    assert!(after["data"]["aiMessages"].as_array().unwrap().is_empty());
    assert!(after["data"]["todos"][0]["remind_at"].is_null());
    let mut bad = original.clone();
    bad["data"]["aiMessages"][0]["conversation_id"] = "missing".into();
    std::fs::write(&path, serde_json::to_vec(&bad).unwrap()).unwrap();
    let bad = other.with_conn(|c| data::read(c, &path)).unwrap();
    assert!(
        other
            .with_tx(|tx| data::apply(tx, &bad, "overwrite"))
            .is_err()
    );
    assert_eq!(
        after["data"],
        serde_json::to_value(other.with_conn(data::export).unwrap()).unwrap()["data"]
    );
}
#[test]
fn daily_backup_retains_seven_and_pending_restore_runs_before_open() {
    let root = tempfile::tempdir().unwrap();
    let config = root.path().join("config");
    let data_dir = root.path().join("data");
    let paths = crate::paths::AppPaths::resolve(config.clone(), data_dir.clone()).unwrap();
    let db = database(&data_dir);
    db.with_tx(|tx| {
        repo::ideas::create(
            tx,
            &crate::domain::idea::IdeaInput {
                content_md: "快照正文".into(),
                date: "2026-10-19".into(),
                tags: vec![],
            },
            1,
            None,
        )?;
        Ok(())
    })
    .unwrap();
    for day in 1..=10 {
        backups::now(&db, &paths.backups_dir, &format!("2026-10-{day:02}"), false).unwrap();
    }
    assert_eq!(backups::list(&paths.backups_dir).unwrap().len(), 7);
    assert!(!paths.backups_dir.join("workbench-20261003.db").exists());
    db.with_tx(|tx| {
        tx.execute("UPDATE idea SET content_md='之后的正文'", [])?;
        Ok(())
    })
    .unwrap();
    assert!(paths.queue_restore("../workbench.db").is_err());
    paths.queue_restore("workbench-20261010.db").unwrap();
    drop(db);
    let resolved = crate::paths::AppPaths::resolve(config.clone(), data_dir).unwrap();
    let restored = Db::open(&resolved.db_path, &resolved.backups_dir).unwrap();
    assert_eq!(
        restored
            .with_conn(|c| Ok(
                c.query_row("SELECT content_md FROM idea", [], |r| r.get::<_, String>(0))?
            ))
            .unwrap(),
        "快照正文"
    );
    assert!(
        !std::fs::read_to_string(config.join("bootstrap.json"))
            .unwrap()
            .contains("pendingRestore")
    );
    assert!(std::fs::read_dir(resolved.backups_dir).unwrap().any(|e| {
        e.unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("pre-restore-")
    }));
}
#[test]
fn filters_calendar_markdown_tree_and_unique_names() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path());
    db.with_tx(|tx| {
        for (body, date) in [
            ("统计一", "2026-10-19"),
            ("统计二", "2026-10-19"),
            ("其他", "2026-10-18"),
        ] {
            repo::ideas::create(
                tx,
                &crate::domain::idea::IdeaInput {
                    content_md: body.into(),
                    date: date.into(),
                    tags: vec!["统计".into()],
                },
                1,
                None,
            )?;
        }
        let p = repo::prompts::create(
            tx,
            &PromptInput {
                title: "CON".into(),
                body: "统计分析 {{topic}}".into(),
                tags: vec!["统计".into()],
                ..Default::default()
            },
            2,
            None,
        )?;
        tx.execute("UPDATE prompt SET is_starred=1 WHERE id=?", [&p.id])?;
        repo::skills::create(
            tx,
            &crate::domain::skill::SkillInput {
                name: "CON".into(),
                description: "简介".into(),
                source_type: "md".into(),
                content_md: Some("---\nname: old\ncustom: kept\n---\n\n# Skill".into()),
                ..Default::default()
            },
            3,
            None,
        )?;
        assert_eq!(
            repo::search::query(tx, "tag:统计 type:prompt is:starred 统计", 8)?.len(),
            1
        );
        assert_eq!(repo::search::query(tx, "tag:统计 type:prompt", 8)?.len(), 1);
        assert!(repo::search::query(tx, "tag:不存在 type:prompt", 8)?.is_empty());
        assert!(repo::search::query(tx, "type:unknown", 8).is_err());
        let days = repo::ideas::calendar(tx, "2026-10")?;
        assert_eq!(days.len(), 2);
        assert_eq!(days[1].count, 2);
        assert!(repo::ideas::calendar(tx, "bad").is_err());
        Ok(())
    })
    .unwrap();
    let output = dir.path().join("markdown");
    db.with_conn(|c| markdown_export::export(c, &output))
        .unwrap();
    db.with_conn(|c| markdown_export::export(c, &output))
        .unwrap();
    assert!(output.join("灵感/2026-10-19.md").exists());
    assert!(output.join("灵感/2026-10-19-2.md").exists());
    assert!(output.join("提示词/CON_.md").exists());
    assert!(output.join("Skills/CON_/SKILL.md").exists());
    let md = std::fs::read_to_string(output.join("Skills/CON_/SKILL.md")).unwrap();
    let front = md
        .strip_prefix("---\n")
        .unwrap()
        .split_once("\n---\n")
        .unwrap()
        .0;
    let yaml: serde_yaml_ng::Value = serde_yaml_ng::from_str(front).unwrap();
    assert!(
        yaml.get("tags").is_some()
            && yaml.get("created").is_some()
            && yaml.get("updated").is_some()
    );
    assert_eq!(yaml["custom"].as_str(), Some("kept"));
}
#[test]
fn skill_scan_depth_exclusions_and_github_raw_conversion() {
    let dir = tempfile::tempdir().unwrap();
    for path in [
        "one/SKILL.md",
        "a/b/c/d/e/SKILL.md",
        "a/b/c/d/e/f/SKILL.md",
        "node_modules/pkg/SKILL.md",
        ".git/sub/SKILL.md",
    ] {
        let p = dir.path().join(path);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, "---\nname: 示例\ndescription: 简介\n---\n内容").unwrap();
    }
    let found = skill_transfer::scan(dir.path()).unwrap();
    assert_eq!(found.len(), 2);
    assert!(found.iter().all(|c| c.name == "示例"));
    assert_eq!(
        skill_transfer::remote_url("https://github.com/owner/repo/blob/main/dir/SKILL.md")
            .unwrap()
            .as_str(),
        "https://raw.githubusercontent.com/owner/repo/main/dir/SKILL.md"
    );
    assert!(skill_transfer::remote_url("file:///secret").is_err());
}
#[tokio::test]
async fn remote_skill_stream_limit_and_preview_parser() {
    use wiremock::{Mock, MockServer, ResponseTemplate, matchers::path};
    let server = MockServer::start().await;
    Mock::given(path("/skill"))
        .respond_with(ResponseTemplate::new(200).set_body_string("# remote Skill"))
        .mount(&server)
        .await;
    Mock::given(path("/large"))
        .respond_with(ResponseTemplate::new(200).set_body_string("a".repeat(1_048_577)))
        .mount(&server)
        .await;
    let client = ai::client::build(&crate::domain::settings::NetworkProxy {
        mode: "none".into(),
        url: None,
    })
    .unwrap();
    assert_eq!(
        skill_transfer::fetch(&client, &format!("{}/skill", server.uri()))
            .await
            .unwrap(),
        "# remote Skill"
    );
    assert!(
        skill_transfer::fetch(&client, &format!("{}/large", server.uri()))
            .await
            .is_err()
    );
    let preview = ai::parse::result(
        "breakdown_todos",
        "```json\n[{\"title\":\"准备材料\",\"dueDate\":null}]\n```",
    );
    assert!(preview.valid);
    assert_eq!(preview.todos[0].priority, 2);
    assert!(!ai::parse::result("breakdown_todos", "not JSON").valid);
}
