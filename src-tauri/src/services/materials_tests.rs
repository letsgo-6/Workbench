use crate::{
    db::{self, Db},
    domain::{common::*, material::*},
    paths::AppPaths,
    repo,
    services::assets::*,
};
use std::{
    fs,
    io::{Cursor, Read},
    path::Path,
    time::{Duration, SystemTime},
};
const NOW: i64 = 1792540800000;
const PNG: &[u8] = b"\x89PNG\r\n\x1a\npayload";
fn fixture(dir: &Path) -> (AppPaths, Db) {
    let paths = AppPaths::resolve(dir.join("config"), dir.join("data")).unwrap();
    let db = Db::open(&paths.db_path, &paths.backups_dir).unwrap();
    (paths, db)
}
fn metadata(kind: &str) -> MaterialInput {
    MaterialInput {
        kind: kind.into(),
        title: "中文设计作品".into(),
        note_md: "渐变视觉".into(),
        prompt: "创建流动按钮".into(),
        tags: vec!["设计".into()],
        ..Default::default()
    }
}
fn import(db: &Db, root: &Path, id: Option<String>, path: &Path) -> MaterialImportResult {
    import_files(
        db,
        root,
        &MaterialImportInput {
            material_id: id,
            kind: Some("work".into()),
            paths: vec![path.to_string_lossy().into()],
        },
        NOW,
    )
    .unwrap()
}
#[test]
fn v2_migration_preserves_links_and_foreign_keys() {
    let mut c = rusqlite::Connection::open_in_memory().unwrap();
    c.execute_batch("PRAGMA foreign_keys=ON").unwrap();
    c.execute_batch(include_str!("../../migrations/0001_init.sql"))
        .unwrap();
    c.execute_batch(include_str!("../../migrations/0002_v02.sql"))
        .unwrap();
    c.pragma_update(None, "user_version", 2).unwrap();
    c.execute_batch("INSERT INTO idea(id,date,created_at,updated_at) VALUES ('old','2026-10-20',1,1);INSERT INTO tag VALUES ('tag','旧标签',NULL,1);INSERT INTO entity_tag VALUES ('idea','old','tag');").unwrap();
    db::migrate::run(&mut c).unwrap();
    db::migrate::run(&mut c).unwrap();
    assert_eq!(
        c.query_row("SELECT count(*) FROM entity_tag", [], |r| r
            .get::<_, u32>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        c.query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| r
            .get::<_, u32>(
            0
        ))
        .unwrap(),
        0
    );
    assert_eq!(
        c.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
            .unwrap(),
        3
    );
}
#[test]
fn material_crud_tags_filters_search_and_ai_context() {
    let dir = tempfile::tempdir().unwrap();
    let (paths, db) = fixture(dir.path());
    let material = db
        .with_tx(|tx| repo::materials::create(tx, &metadata("component"), NOW, None))
        .unwrap();
    let file = dir.path().join("原文件检索.png");
    fs::write(&file, PNG).unwrap();
    let saved = import(&db, &paths.assets_dir, Some(material.id.clone()), &file);
    assert_eq!(saved.added, 1);
    for query in [
        "中文设计",
        "渐变视觉",
        "流动按钮",
        "原文件检索",
        "type:material tag:设计",
    ] {
        assert_eq!(
            db.with_conn(|c| repo::search::query(c, query, 8))
                .unwrap()
                .len(),
            1,
            "{query}"
        );
    }
    let r = EntityRef {
        entity_type: EntityType::Material,
        id: material.id.clone(),
    };
    db.with_tx(|tx| repo::common::mutate(tx, &r, "star", NOW + 1, true))
        .unwrap();
    assert_eq!(
        db.with_conn(|c| repo::materials::list(
            c,
            &ListQuery {
                material_kind: Some("component".into()),
                starred_only: true,
                limit: Some(1),
                ..Default::default()
            }
        ))
        .unwrap()
        .total,
        1
    );
    assert_eq!(
        db.with_conn(|c| repo::materials::list(
            c,
            &ListQuery {
                material_kind: Some("work".into()),
                ..Default::default()
            }
        ))
        .unwrap()
        .total,
        0
    );
    assert!(
        db.with_conn(|c| repo::materials::list(
            c,
            &ListQuery {
                offset: 1,
                ..Default::default()
            }
        ))
        .unwrap()
        .items
        .is_empty()
    );
    let context = db
        .with_conn(|c| {
            crate::services::ai::context::build(
                c,
                &crate::domain::ai::AiInput::Entities {
                    refs: vec![r.clone()],
                },
                24000,
            )
        })
        .unwrap()
        .0;
    assert!(context.contains("渐变视觉") && context.contains("创建流动按钮"));
    assert!(!context.contains("payload"));
    let chat = crate::domain::ai::AiChatInput {
        request_id: "material-reference".into(),
        provider_id: None,
        conversation_id: None,
        messages: vec![crate::domain::ai::ChatMessage {
            role: "user".into(),
            content: "比较这个组件".into(),
        }],
        refs: vec![r.clone()],
    };
    let (messages, _) = db
        .with_tx(|tx| {
            crate::services::ai::chat::prepare(
                tx,
                &chat,
                "material-chat",
                "provider",
                "test-key",
                NOW,
            )
        })
        .unwrap();
    assert!(messages[0].content.contains("创建流动按钮"));
    assert!(!messages[0].content.contains("payload"));
    let stored = db
        .with_conn(|c| repo::conversations::get(c, "material-chat"))
        .unwrap();
    assert_eq!(stored.messages[0].refs[0].entity_type, EntityType::Material);
    assert_eq!(stored.messages[0].refs[0].id, material.id);
    db.with_tx(|tx| {
        repo::tags::change(
            tx,
            &material.tags[0].id,
            Some("新设计"),
            None,
            false,
            NOW + 2,
        )
    })
    .unwrap();
    assert_eq!(
        db.with_conn(|c| repo::search::query(c, "type:material tag:新设计", 8))
            .unwrap()
            .len(),
        1
    );
    db.with_tx(|tx| repo::common::mutate(tx, &r, "delete", NOW + 3, false))
        .unwrap();
    assert!(Path::new(&saved.material.assets[0].path).exists());
    assert_eq!(db.with_conn(repo::trash::list).unwrap().len(), 1);
    db.with_tx(|tx| repo::common::mutate(tx, &r, "restore", NOW + 4, false))
        .unwrap();
    assert_eq!(
        db.with_conn(|c| repo::materials::get(c, &r.id))
            .unwrap()
            .assets
            .len(),
        1
    );
}
#[test]
fn failed_read_or_failed_transaction_leaves_no_files_or_records() {
    struct Broken {
        left: usize,
    }
    impl Read for Broken {
        fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
            if self.left == 0 {
                return Err(std::io::Error::other("injected read failure"));
            }
            let len = buffer.len().min(self.left);
            buffer[..len].fill(0);
            self.left -= len;
            Ok(len)
        }
    }
    let dir = tempfile::tempdir().unwrap();
    let (paths, db) = fixture(dir.path());
    {
        let mut guard = PendingFiles::default();
        let mut reader = Cursor::new(PNG.to_vec()).chain(Broken { left: 100000 });
        assert!(
            stage_reader(
                &paths.assets_dir,
                "a.png",
                &mut reader,
                200000,
                NOW,
                &mut guard
            )
            .is_err()
        );
    }
    assert!(walk(&paths.assets_dir).unwrap().is_empty());
    db.with_tx(|tx|{tx.execute_batch("CREATE TRIGGER reject_material BEFORE INSERT ON material BEGIN SELECT RAISE(ABORT,'injected'); END;")?;Ok(())}).unwrap();
    let file = dir.path().join("a.png");
    fs::write(&file, PNG).unwrap();
    assert!(
        import_files(
            &db,
            &paths.assets_dir,
            &MaterialImportInput {
                material_id: None,
                kind: None,
                paths: vec![file.to_string_lossy().into()]
            },
            NOW
        )
        .is_err()
    );
    assert!(walk(&paths.assets_dir).unwrap().is_empty());
    assert_eq!(
        db.with_conn(|c| repo::materials::list(c, &ListQuery::default()))
            .unwrap()
            .total,
        0
    );
}
#[test]
fn batch_validation_rollback_and_same_material_hash_dedup() {
    let dir = tempfile::tempdir().unwrap();
    let (paths, db) = fixture(dir.path());
    let good = dir.path().join("a.png");
    let bad = dir.path().join("bad.png");
    fs::write(&good, PNG).unwrap();
    fs::write(&bad, b"text masquerading as image").unwrap();
    let input = MaterialImportInput {
        material_id: None,
        kind: None,
        paths: vec![good.to_string_lossy().into(), bad.to_string_lossy().into()],
    };
    assert!(import_files(&db, &paths.assets_dir, &input, NOW).is_err());
    assert!(walk(&paths.assets_dir).unwrap().is_empty());
    let first = import(&db, &paths.assets_dir, None, &good);
    let second = import(&db, &paths.assets_dir, Some(first.material.id), &good);
    assert_eq!((second.added, second.skipped), (0, 1));
    assert_eq!(walk(&paths.assets_dir).unwrap().len(), 1);
    assert!(
        import_files(
            &db,
            &paths.assets_dir,
            &MaterialImportInput {
                paths: vec![good.to_string_lossy().into(); 51],
                material_id: None,
                kind: None
            },
            NOW
        )
        .is_err()
    );
}
#[test]
fn purge_retention_recovery_missing_and_orphan_age() {
    let dir = tempfile::tempdir().unwrap();
    let (paths, db) = fixture(dir.path());
    let file = dir.path().join("a.png");
    fs::write(&file, PNG).unwrap();
    let first = import(&db, &paths.assets_dir, None, &file);
    let record = db
        .with_conn(|c| repo::materials::asset_records(c, Some(&first.material.id)))
        .unwrap()
        .remove(0);
    delete_asset(&db, &paths.assets_dir, &record.id, NOW).unwrap();
    assert!(!Path::new(&first.material.assets[0].path).exists());
    assert!(
        paths
            .assets_dir
            .join("_purged")
            .join(format!("{}.png", record.id))
            .is_file()
    );
    db.with_tx(|tx| repo::materials::add_asset(tx, &first.material.id, &record, NOW + 1))
        .unwrap();
    let mut recovered = db
        .with_conn(|c| repo::materials::get(c, &first.material.id))
        .unwrap();
    hydrate(&paths.assets_dir, &mut recovered).unwrap();
    assert!(!recovered.assets[0].missing);
    fs::remove_file(&recovered.assets[0].path).unwrap();
    let mut missing = db
        .with_conn(|c| repo::materials::get(c, &first.material.id))
        .unwrap();
    hydrate(&paths.assets_dir, &mut missing).unwrap();
    assert!(missing.assets[0].missing);
    let second = import(&db, &paths.assets_dir, None, &file);
    let r = EntityRef {
        entity_type: EntityType::Material,
        id: second.material.id,
    };
    purge_entities(&db, &paths.assets_dir, &[r], NOW).unwrap();
    maintenance(&db, &paths.assets_dir, NOW + 30 * 86400000).unwrap();
    assert!(!walk(&paths.assets_dir.join("_purged")).unwrap().is_empty());
    maintenance(&db, &paths.assets_dir, NOW + 30 * 86400000 + 1).unwrap();
    assert!(walk(&paths.assets_dir.join("_purged")).unwrap().is_empty());
    let orphan = paths
        .assets_dir
        .join("2026/10/019a0000-0000-7000-8000-000000000000.png");
    fs::create_dir_all(orphan.parent().unwrap()).unwrap();
    fs::write(&orphan, PNG).unwrap();
    fs::File::options()
        .write(true)
        .open(&orphan)
        .unwrap()
        .set_modified(SystemTime::UNIX_EPOCH + Duration::from_millis((NOW - 8 * 86400000) as u64))
        .unwrap();
    maintenance(&db, &paths.assets_dir, NOW).unwrap();
    assert!(!orphan.exists());
    assert_eq!(walk(&paths.assets_dir.join("_purged")).unwrap().len(), 1);
}
#[test]
fn reorder_cover_thumbnail_and_portable_directory_copy() {
    let dir = tempfile::tempdir().unwrap();
    let (paths, db) = fixture(dir.path());
    let one = dir.path().join("a.png");
    let two = dir.path().join("b.gif");
    fs::write(&one, PNG).unwrap();
    fs::write(&two, b"GIF89apayload").unwrap();
    let first = import(&db, &paths.assets_dir, None, &one);
    let id = first.material.id;
    let saved = import(&db, &paths.assets_dir, Some(id.clone()), &two);
    let ids = saved
        .material
        .assets
        .iter()
        .rev()
        .map(|a| a.id.clone())
        .collect::<Vec<_>>();
    db.with_tx(|tx| {
        repo::materials::reorder(
            tx,
            &AssetOrderInput {
                material_id: id.clone(),
                ids: ids.clone(),
            },
            NOW + 1,
        )
    })
    .unwrap();
    assert_eq!(
        db.with_conn(|c| repo::materials::get(c, &id))
            .unwrap()
            .assets[0]
            .id,
        ids[0]
    );
    assert!(
        db.with_tx(|tx| repo::materials::reorder(
            tx,
            &AssetOrderInput {
                material_id: id.clone(),
                ids: vec![ids[0].clone(); 2]
            },
            NOW
        ))
        .is_err()
    );
    set_thumbnail(
        &db,
        &paths.assets_dir,
        &ids[0],
        b"RIFF1234WEBPpayload",
        ThumbnailInfo {
            width: 640,
            height: 480,
            duration_ms: Some(1000),
        },
        NOW,
    )
    .unwrap();
    let bootstrap = fs::read(paths.config_dir.join("bootstrap.json")).unwrap();
    let target = dir.path().join("new");
    fs::create_dir_all(target.join("assets")).unwrap();
    assert!(change_directory(&db, &paths, &target).is_err());
    assert_eq!(
        fs::read(paths.config_dir.join("bootstrap.json")).unwrap(),
        bootstrap
    );
    let target = dir.path().join("new-ok");
    change_directory(&db, &paths, &target).unwrap();
    assert_eq!(
        walk(&target.join("assets")).unwrap().len(),
        walk(&paths.assets_dir).unwrap().len()
    );
    for file in walk(&paths.assets_dir).unwrap() {
        let relative = file.strip_prefix(&paths.assets_dir).unwrap();
        assert_eq!(
            hash_file(&file).unwrap(),
            hash_file(&target.join("assets").join(relative)).unwrap()
        );
    }
}

#[test]
fn full_backup_roundtrip_files_thumbs_cover_tags_and_merge_no_copy() {
    use crate::services::{ai, backup_package, data, secrets::SecretStore};
    let dir = tempfile::tempdir().unwrap();
    let (paths, db) = fixture(dir.path());
    db.with_tx(ai::actions::seed_system_templates).unwrap();
    let file = dir.path().join("中文原图.png");
    fs::write(&file, PNG).unwrap();
    let saved = import(&db, &paths.assets_dir, None, &file);
    let asset = &saved.material.assets[0];
    set_thumbnail(
        &db,
        &paths.assets_dir,
        &asset.id,
        b"RIFF1234WEBPthumb",
        ThumbnailInfo {
            width: 800,
            height: 600,
            duration_ms: None,
        },
        NOW,
    )
    .unwrap();
    db.with_tx(|tx| {
        let mut input = metadata("component");
        input.cover_asset_id = Some(asset.id.clone());
        repo::materials::update(tx, &saved.material.id, &input, NOW + 1)?;
        Ok(())
    })
    .unwrap();
    let original = serde_json::to_value(db.with_conn(data::export).unwrap()).unwrap();
    assert_eq!(original["schemaVersion"], 3);
    let package = dir.path().join("full.wbbackup");
    backup_package::export(&db, &paths.assets_dir, &package).unwrap();
    let fresh = tempfile::tempdir().unwrap();
    let (other_paths, other) = fixture(fresh.path());
    let secrets = SecretStore::default();
    backup_package::import(&other, &secrets, &other_paths, &package, "overwrite").unwrap();
    let restored = serde_json::to_value(other.with_conn(data::export).unwrap()).unwrap();
    assert_eq!(original["data"], restored["data"]);
    let copied = walk(&other_paths.assets_dir).unwrap();
    assert_eq!(copied.len(), 2);
    for path in &copied {
        let relative = path.strip_prefix(&other_paths.assets_dir).unwrap();
        assert_eq!(
            hash_file(path).unwrap(),
            hash_file(&paths.assets_dir.join(relative)).unwrap()
        );
    }
    let stamps = copied
        .iter()
        .map(|p| fs::metadata(p).unwrap().modified().unwrap())
        .collect::<Vec<_>>();
    let merged = backup_package::import(&other, &secrets, &other_paths, &package, "merge").unwrap();
    assert_eq!(merged.inserted, 0);
    for (path, stamp) in copied.iter().zip(stamps) {
        assert_eq!(fs::metadata(path).unwrap().modified().unwrap(), stamp);
    }
    let output = fresh.path().join("markdown");
    other
        .with_conn(|c| {
            crate::services::markdown_export::export_with_assets(
                c,
                &output,
                &other_paths.assets_dir,
            )
        })
        .unwrap();
    let tree = walk(&output).unwrap();
    assert!(tree.iter().any(|p| p.file_name().unwrap() == "prompt.md"));
    assert!(
        tree.iter()
            .any(|p| p.file_name().unwrap() == "中文原图.png")
    );
}
#[test]
fn full_backup_rejects_traversal_absolute_svg_bombs_and_hash_damage() {
    use crate::services::{backup_package, secrets::SecretStore};
    use std::io::{Read, Write};
    use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};
    let dir = tempfile::tempdir().unwrap();
    let (paths, db) = fixture(dir.path());
    let secrets = SecretStore::default();
    for name in [
        "../escape.png",
        "/absolute.png",
        "C:/absolute.png",
        "assets/2026/10/../escape.png",
        "assets/2026/10/019a0000-0000-7000-8000-000000000000.svg",
        "assets\\2026\\10\\bad.png",
        "unexpected.txt",
    ] {
        let file = dir.path().join("bad.wbbackup");
        let mut zip = ZipWriter::new(fs::File::create(&file).unwrap());
        zip.start_file(name, SimpleFileOptions::default()).unwrap();
        zip.write_all(PNG).unwrap();
        zip.finish().unwrap();
        assert!(
            backup_package::import(&db, &secrets, &paths, &file, "overwrite").is_err(),
            "{name}"
        );
    }
    let bomb = dir.path().join("bomb.wbbackup");
    let mut zip = ZipWriter::new(fs::File::create(&bomb).unwrap());
    zip.start_file(
        "data.json",
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
    )
    .unwrap();
    zip.write_all(&vec![0; 1_000_000]).unwrap();
    zip.finish().unwrap();
    assert!(backup_package::import(&db, &secrets, &paths, &bomb, "overwrite").is_err());
    let image = dir.path().join("image.png");
    fs::write(&image, PNG).unwrap();
    import(&db, &paths.assets_dir, None, &image);
    let valid = dir.path().join("valid.wbbackup");
    backup_package::export(&db, &paths.assets_dir, &valid).unwrap();
    let damaged = dir.path().join("damaged.wbbackup");
    let mut input = ZipArchive::new(fs::File::open(&valid).unwrap()).unwrap();
    let mut output = ZipWriter::new(fs::File::create(&damaged).unwrap());
    for i in 0..input.len() {
        let mut entry = input.by_index(i).unwrap();
        let name = entry.name().unwrap().into_owned();
        let mut bytes = vec![];
        entry.read_to_end(&mut bytes).unwrap();
        if name.starts_with("assets/") {
            *bytes.last_mut().unwrap() ^= 1;
        }
        output
            .start_file(name, SimpleFileOptions::default())
            .unwrap();
        output.write_all(&bytes).unwrap();
    }
    output.finish().unwrap();
    let fresh = tempfile::tempdir().unwrap();
    let (other_paths, other) = fixture(fresh.path());
    assert!(backup_package::import(&other, &secrets, &other_paths, &damaged, "overwrite").is_err());
    assert!(walk(&other_paths.assets_dir).unwrap().is_empty());
    assert_eq!(
        other
            .with_conn(|c| repo::materials::list(c, &ListQuery::default()))
            .unwrap()
            .total,
        0
    );
}
#[test]
fn legacy_json_v1_v2_and_motion_setting_validation() {
    use crate::services::data;
    let dir = tempfile::tempdir().unwrap();
    let (paths, db) = fixture(dir.path());
    for version in [1, 2] {
        let mut json =
            serde_json::to_value(db.with_conn(data::export_v2_fixture).unwrap()).unwrap();
        json["schemaVersion"] = version.into();
        if version == 1 {
            let map = json["data"].as_object_mut().unwrap();
            for key in ["promptVersions", "aiConversations", "aiMessages"] {
                map.remove(key);
            }
            for row in map["todos"].as_array_mut().unwrap() {
                row.as_object_mut().unwrap().remove("remind_at");
                row.as_object_mut().unwrap().remove("reminded_at");
            }
        }
        let backup = db
            .with_conn(|c| data::decode(c, &serde_json::to_vec(&json).unwrap()))
            .unwrap();
        db.with_tx(|tx| data::apply(tx, &backup, "overwrite"))
            .unwrap();
        assert_eq!(
            db.with_conn(|c| repo::materials::list(c, &ListQuery::default()))
                .unwrap()
                .total,
            0
        );
    }
    for motion in ["system", "full", "lite", "off"] {
        assert_eq!(
            db.with_tx(|tx| repo::settings::set(
                tx,
                "appearance.motion",
                &serde_json::json!(motion)
            ))
            .unwrap()
            .appearance_motion,
            motion
        );
    }
    assert!(
        db.with_tx(|tx| repo::settings::set(tx, "appearance.motion", &serde_json::json!(true)))
            .is_err()
    );
    assert!(
        db.with_tx(|tx| repo::settings::set(tx, "home.futureSetting", &serde_json::json!("daily")))
            .is_err()
    );
    assert!(paths.assets_dir.exists());
}
#[test]
fn capture_material_source_links_prompt_and_template_upgrade() {
    use crate::services::{ai, capture};
    use serde_json::json;
    let original = "收藏一个作品 https://dribbble.com/shots/123 渐变风格的音乐播放器";
    let now = chrono::DateTime::from_timestamp_millis(NOW)
        .unwrap()
        .naive_utc();
    let ctx = capture::normalize::Context {
        target: None,
        original,
        forced: None,
        now,
        existing_tags: &[],
        known_tools: &[],
    };
    let preview=capture::normalize::build_preview(&json!({"items":[{"type":"material","materialKind":"component","prompt":"编造的提示词","url":"https://invented.invalid","confidence":"high"}]}).to_string(),&ctx,false).unwrap();
    let item = &preview.items[0];
    assert_eq!(item.kind, EntityType::Material);
    assert_eq!(item.body, original);
    assert_eq!(item.material_kind.as_deref(), Some("component"));
    assert!(item.url.is_none());
    assert!(item.material_prompt.is_empty());
    assert!(!preview.auto_save_eligible);
    for prefix in ["作品：正文", "素材: 正文", "组件 正文"] {
        assert_eq!(
            capture::prefix::detect(prefix),
            Some((EntityType::Material, "正文"))
        );
    }
    let dir = tempfile::tempdir().unwrap();
    let (_, db) = fixture(dir.path());
    db.with_tx(ai::actions::seed_system_templates).unwrap();
    let raw = include_str!("../../../tests/fixtures/smart_capture_v021.md")
        .trim_start_matches("---system---\n");
    let (system, body) = raw.split_once("---user---\n").unwrap();
    db.with_tx(|tx| {
        tx.execute(
            "UPDATE prompt SET body=?,system_prompt=? WHERE template_key='smart_capture'",
            rusqlite::params![body.trim(), system.trim()],
        )?;
        ai::actions::seed_system_templates(tx)
    })
    .unwrap();
    let templates = db.with_conn(ai::actions::list).unwrap();
    let upgraded = templates
        .iter()
        .find(|p| p.template_key.as_deref() == Some("smart_capture"))
        .unwrap();
    assert!(upgraded.body.contains("materialKind"));
    assert_eq!(upgraded.has_new_default, Some(false));
    db.with_tx(|tx| {
        tx.execute(
            "UPDATE prompt SET body='custom' WHERE template_key='smart_capture'",
            [],
        )?;
        ai::actions::seed_system_templates(tx)
    })
    .unwrap();
    let custom = db.with_conn(ai::actions::list).unwrap();
    let custom = custom
        .iter()
        .find(|p| p.template_key.as_deref() == Some("smart_capture"))
        .unwrap();
    assert_eq!(custom.body, "custom");
    assert_eq!(custom.has_new_default, Some(true));
}

#[test]
fn snapshot_restore_recovers_retained_files_before_expiry_cleanup() {
    let dir = tempfile::tempdir().unwrap();
    let (paths, db) = fixture(dir.path());
    let file = dir.path().join("restored.png");
    fs::write(&file, PNG).unwrap();
    let first = import(&db, &paths.assets_dir, None, &file);
    let record = db
        .with_conn(|c| repo::materials::asset_records(c, None))
        .unwrap()
        .remove(0);
    retain_files(&paths.assets_dir, std::slice::from_ref(&record), NOW).unwrap();
    maintenance(&db, &paths.assets_dir, NOW + 31 * 86400000).unwrap();
    assert!(Path::new(&first.material.assets[0].path).is_file());
    assert!(walk(&paths.assets_dir.join("_purged")).unwrap().is_empty());
    assert!(!discard_empty(&db, &first.material.id, NOW).unwrap());
    assert!(validate_export_target(&paths, &paths.assets_dir.join("overwrite.json")).is_err());
    assert!(validate_export_target(&paths, &paths.db_path).is_err());
    assert!(validate_export_target(&paths, &dir.path().join("safe.json")).is_ok());
    let backup = paths.backups_dir.join("verify.db");
    crate::services::data::snapshot(&db, &backup).unwrap();
    crate::services::backups::validate(&backup).unwrap();
    let conn = rusqlite::Connection::open(&backup).unwrap();
    conn.execute_batch("DROP TABLE material_asset").unwrap();
    drop(conn);
    assert!(crate::services::backups::validate(&backup).is_err());
}

#[test]
fn full_backup_rejects_a_damaged_thumbnail_before_publishing() {
    let dir = tempfile::tempdir().unwrap();
    let (paths, db) = fixture(dir.path());
    let source = dir.path().join("original.png");
    fs::write(&source, PNG).unwrap();
    let item = import(&db, &paths.assets_dir, None, &source).material;
    let thumbnail = set_thumbnail(
        &db,
        &paths.assets_dir,
        &item.assets[0].id,
        b"RIFF1234WEBPpayload",
        ThumbnailInfo {
            width: 10,
            height: 10,
            duration_ms: None,
        },
        NOW,
    )
    .unwrap();
    fs::write(thumbnail.thumb_path.unwrap(), b"damaged").unwrap();
    let output = dir.path().join("damaged.wbbackup");
    assert!(crate::services::backup_package::export(&db, &paths.assets_dir, &output).is_err());
    assert!(!output.exists());
    assert!(dir.path().read_dir().unwrap().all(|e| {
        e.unwrap()
            .path()
            .extension()
            .is_none_or(|ext| ext != "part")
    }));
    assert!(Path::new(&item.assets[0].path).is_file());
    assert_eq!(
        db.with_conn(|c| repo::materials::list(c, &ListQuery::default()))
            .unwrap()
            .total,
        1
    );
}
