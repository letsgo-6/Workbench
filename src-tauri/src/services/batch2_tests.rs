use super::*;
use crate::{
    db::Db,
    domain::{common::*, provider::ProviderInput},
    repo,
};
use rusqlite::params;
use std::path::Path;
struct TestLogger(parking_lot::Mutex<Vec<String>>);
static LOGGER: TestLogger = TestLogger(parking_lot::Mutex::new(Vec::new()));
impl log::Log for TestLogger {
    fn enabled(&self, m: &log::Metadata<'_>) -> bool {
        m.target() == "workbench"
    }
    fn log(&self, r: &log::Record<'_>) {
        if self.enabled(r.metadata()) {
            self.0.lock().push(format!("{}", r.args()));
        }
    }
    fn flush(&self) {}
}
fn database(dir: &Path) -> Db {
    std::fs::create_dir_all(dir.join("backups")).unwrap();
    Db::open(&dir.join("workbench.db"), &dir.join("backups")).unwrap()
}
fn input() -> ProviderInput {
    ProviderInput {
        id: None,
        name: "test provider".into(),
        base_url: "https://example.invalid/v1".into(),
        model: "model".into(),
        temperature: 0.7,
        max_tokens: None,
        api_key: None,
    }
}
#[test]
fn backup_roundtrip_merge_and_rollback() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path());
    db.with_tx(|tx|{ai::actions::seed_system_templates(tx)?;
  repo::ideas::create(tx,&serde_json::from_value(serde_json::json!({"contentMd":"统计分析笔记","date":"2026-10-19","tags":["统计"]}))?,100,None)?;
  repo::todos::create(tx,&serde_json::from_value(serde_json::json!({"title":"待办","noteMd":"备注","dueDate":"2026-10-19","priority":1,"sortOrder":0,"tags":["统计"]}))?,101,None)?;
  repo::tips::create(tx,&serde_json::from_value(serde_json::json!({"title":"技巧","contentMd":"步骤","tools":["Codex"],"sourceUrl":null,"tags":["统计"]}))?,102,None)?;
  repo::skills::create(tx,&serde_json::from_value(serde_json::json!({"name":"Skill","description":"简介","sourceType":"md","contentMd":"# Skill","url":null,"platforms":[],"rating":5,"note":"记录","tags":["统计"]}))?,103,None)?;
  let p=repo::prompts::create(tx,&serde_json::from_value(serde_json::json!({"title":"提示词","body":"{{topic}}","systemPrompt":null,"category":"写作","targetModel":null,"tags":["统计"]}))?,104,None)?;
  repo::common::mutate(tx,&EntityRef{entity_type:EntityType::Prompt,id:p.id},"delete",105,false)?;
  tx.execute("UPDATE idea SET is_starred=1",[])?;
  repo::providers::save(tx,"public-provider",&input(),106)?;Ok(())}).unwrap();
    let original = db.with_conn(data::export).unwrap();
    let json = serde_json::to_value(&original).unwrap();
    let path = dir.path().join("export.json");
    std::fs::write(&path, serde_json::to_vec(&original).unwrap()).unwrap();
    let fresh = tempfile::tempdir().unwrap();
    let fresh_db = database(fresh.path());
    let parsed = fresh_db.with_conn(|c| data::read(c, &path)).unwrap();
    fresh_db
        .with_tx(|tx| data::apply(tx, &parsed, "overwrite"))
        .unwrap();
    let after = serde_json::to_value(fresh_db.with_conn(data::export).unwrap()).unwrap();
    assert_eq!(json["data"], after["data"]);
    let result = fresh_db
        .with_tx(|tx| data::apply(tx, &parsed, "merge"))
        .unwrap();
    assert_eq!(result.updated, 0);
    assert_eq!(result.inserted, 0);
    assert!(result.skipped >= 5);
    assert!(
        !fresh_db
            .with_conn(|c| repo::search::query(c, "统计", 8))
            .unwrap()
            .is_empty()
    );
    let mut bad = json.clone();
    bad["data"]["todos"][0]["priority"] = 999.into();
    std::fs::write(&path, serde_json::to_vec(&bad).unwrap()).unwrap();
    let parsed = fresh_db.with_conn(|c| data::read(c, &path)).unwrap();
    assert!(
        fresh_db
            .with_tx(|tx| data::apply(tx, &parsed, "overwrite"))
            .is_err()
    );
    let rolled = serde_json::to_value(fresh_db.with_conn(data::export).unwrap()).unwrap();
    assert_eq!(after["data"], rolled["data"]);
    bad["schemaVersion"] = 99.into();
    std::fs::write(&path, serde_json::to_vec(&bad).unwrap()).unwrap();
    assert!(fresh_db.with_conn(|c| data::read(c, &path)).is_err());
}
#[test]
fn merge_remaps_same_name_tags_and_newer_rows_win() {
    let remote = tempfile::tempdir().unwrap();
    let db = database(remote.path());
    db.with_tx(|tx| {
        ai::actions::seed_system_templates(tx)?;
        repo::ideas::create(
            tx,
            &serde_json::from_value(
                serde_json::json!({"contentMd":"newer","date":"2026-10-19","tags":["Same"]}),
            )?,
            200,
            None,
        )?;
        Ok(())
    })
    .unwrap();
    let backup = db.with_conn(data::export).unwrap();
    let path = remote.path().join("backup.json");
    std::fs::write(&path, serde_json::to_vec(&backup).unwrap()).unwrap();
    let local = tempfile::tempdir().unwrap();
    let local_db = database(local.path());
    local_db
        .with_tx(|tx| {
            ai::actions::seed_system_templates(tx)?;
            tx.execute(
                "INSERT INTO tag(id,name,created_at) VALUES ('local-id','same',1)",
                [],
            )?;
            Ok(())
        })
        .unwrap();
    let backup = local_db.with_conn(|c| data::read(c, &path)).unwrap();
    local_db
        .with_tx(|tx| data::apply(tx, &backup, "merge"))
        .unwrap();
    local_db
        .with_conn(|c| {
            assert_eq!(
                c.query_row("SELECT tag_id FROM entity_tag", [], |r| r
                    .get::<_, String>(0))?,
                "local-id"
            );
            c.execute(
                "UPDATE idea SET updated_at=300,content_md='local newer'",
                [],
            )?;
            Ok(())
        })
        .unwrap();
    local_db
        .with_tx(|tx| data::apply(tx, &backup, "merge"))
        .unwrap();
    local_db
        .with_conn(|c| {
            assert_eq!(
                c.query_row("SELECT content_md FROM idea", [], |r| r.get::<_, String>(0))?,
                "local newer"
            );
            Ok(())
        })
        .unwrap();
}
#[test]
fn seed_preserves_edits_and_reset_is_scoped() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path());
    db.with_tx(|tx| {
        ai::actions::seed_system_templates(tx)?;
        tx.execute(
            "UPDATE prompt SET body='custom {{input}}' WHERE template_key='polish'",
            [],
        )?;
        ai::actions::seed_system_templates(tx)?;
        let (messages, _) = ai::actions::messages(
            tx,
            "polish",
            &crate::domain::ai::AiInput::Text {
                text: "示例".into(),
            },
            24000,
        )?;
        assert_eq!(messages[1].content, "custom 示例");
        ai::actions::reset(tx, "shorten")?;
        assert_eq!(
            tx.query_row(
                "SELECT body FROM prompt WHERE template_key='polish'",
                [],
                |r| r.get::<_, String>(0)
            )?,
            "custom {{input}}"
        );
        ai::actions::reset(tx, "polish")?;
        assert!(!ai::actions::list(tx)?[0].body.starts_with("custom"));
        Ok(())
    })
    .unwrap();
}
#[test]
fn credential_child() {
    if let Ok(id) = std::env::var("WORKBENCH_TEST_CREDENTIAL_ID") {
        let store = secrets::SecretStore::default();
        assert!(store.has(&id).unwrap());
        assert!(
            store
                .get(&id)
                .unwrap()
                .is_some_and(|k| k.starts_with("sk-test-"))
        );
    }
}
#[test]
fn native_credential_persists_across_process_and_never_enters_files() {
    let dir = tempfile::tempdir().unwrap();
    let db = database(dir.path());
    let store = secrets::SecretStore::default();
    let id = uuid::Uuid::now_v7().to_string();
    let key = format!("sk-test-{}", uuid::Uuid::now_v7());
    struct Cleanup(String);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = secrets::SecretStore::default().delete(&self.0);
        }
    }
    let _cleanup = Cleanup(id.clone());
    let mut form = input();
    form.api_key = Some(key.clone());
    // The first insert uses a test-owned UUID; the public save command does not accept phantom updates.
    db.with_tx(|tx| repo::providers::save(tx, &id, &form, 1))
        .unwrap();
    form.id = Some(id.clone());
    let view = providers::save(&db, &store, &form).unwrap();
    assert!(view.has_key);
    assert!(!serde_json::to_string(&view).unwrap().contains(&key));
    let child = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "services::batch2_tests::credential_child"])
        .env("WORKBENCH_TEST_CREDENTIAL_ID", &id)
        .output()
        .unwrap();
    assert!(child.status.success(), "credential child failed");
    let paths =
        crate::paths::AppPaths::resolve(dir.path().join("config"), dir.path().to_path_buf())
            .unwrap();
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(log::LevelFilter::Warn);
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            let server = wiremock::MockServer::start().await;
            wiremock::Mock::given(wiremock::matchers::method("POST"))
                .respond_with(
                    wiremock::ResponseTemplate::new(500)
                        .set_body_json(serde_json::json!({"error":{"message":key}})),
                )
                .mount(&server)
                .await;
            let mut p = db
                .with_conn(|c| repo::providers::get(c, Some(&id)))
                .unwrap();
            p.base_url = server.uri();
            let ai = ai::AiService::new(&crate::domain::settings::NetworkProxy {
                mode: "none".into(),
                url: None,
            })
            .unwrap();
            ai.run(
                "leak-test",
                p,
                key.clone(),
                vec![crate::domain::ai::ChatMessage {
                    role: "user".into(),
                    content: "ping".into(),
                }],
                false,
                |event| {
                    assert!(!serde_json::to_string(&event).unwrap().contains(&key));
                    true
                },
            )
            .await
            .unwrap();
        });
    let log_path = dir.path().join("workbench.log");
    let captured = LOGGER.0.lock().join("\n");
    assert!(captured.contains("AI request ended"));
    std::fs::write(&log_path, captured).unwrap();
    let backup = db.with_conn(data::export).unwrap();
    let export = dir.path().join("backup.json");
    std::fs::write(&export, serde_json::to_vec(&backup).unwrap()).unwrap();
    db.with_conn(|c| {
        c.execute_batch("PRAGMA wal_checkpoint(FULL);")?;
        Ok(())
    })
    .unwrap();
    for path in [
        paths.db_path,
        paths.config_dir.join("bootstrap.json"),
        export.clone(),
        log_path,
    ] {
        let bytes = std::fs::read(path).unwrap();
        assert!(!bytes.windows(key.len()).any(|w| w == key.as_bytes()));
    }
    let mut invalid = serde_json::to_value(&backup).unwrap();
    invalid["data"]["settings"]["unknown.setting"] = true.into();
    let invalid_path = dir.path().join("invalid.json");
    std::fs::write(&invalid_path, serde_json::to_vec(&invalid).unwrap()).unwrap();
    assert!(data::import(&db, &store, &paths.backups_dir, &invalid_path, "overwrite").is_err());
    assert!(store.get(&id).unwrap().is_some_and(|value| value == key));
    let report = data::import(&db, &store, &paths.backups_dir, &export, "merge").unwrap();
    assert!(report.skipped > 0);
    assert!(!store.has(&id).unwrap());
    assert_ne!(secrets::SecretStore::hint("1234567"), "1234567");
    store.set(&id, &key).unwrap();
    store.delete(&id).unwrap();
    assert!(!store.has(&id).unwrap());
    db.with_conn(|c| {
        let count: i64 = c.query_row(
            "SELECT count(*) FROM ai_provider WHERE id=?",
            params![id],
            |r| r.get(0),
        )?;
        assert_eq!(count, 1);
        Ok(())
    })
    .unwrap();
}
#[test]
fn directory_snapshot_switch_keeps_old_database_and_reopens_new_copy() {
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join("config");
    let old = dir.path().join("old");
    let new = dir.path().join("new");
    let paths = crate::paths::AppPaths::resolve(config.clone(), old.clone()).unwrap();
    let db = Db::open(&paths.db_path, &paths.backups_dir).unwrap();
    db.with_tx(|tx| {
        repo::settings::set(tx, "appearance.theme", &serde_json::json!("dark"))?;
        Ok(())
    })
    .unwrap();
    std::fs::create_dir_all(&new).unwrap();
    data::snapshot(&db, &new.join("workbench.db")).unwrap();
    paths.set_data_dir(new.clone()).unwrap();
    let reopened = crate::paths::AppPaths::resolve(config, old).unwrap();
    assert_eq!(reopened.data_dir, new);
    assert!(paths.db_path.exists());
    let copy = Db::open(&reopened.db_path, &reopened.backups_dir).unwrap();
    assert_eq!(
        copy.with_conn(repo::settings::get_all)
            .unwrap()
            .appearance_theme,
        "dark"
    );
}
