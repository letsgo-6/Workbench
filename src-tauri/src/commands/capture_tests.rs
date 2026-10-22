use super::*;
use crate::{db, domain::common::EntityRef, repo};
use rusqlite::Connection;
use serde_json::json;

fn database() -> Connection {
    let mut c = Connection::open_in_memory().unwrap();
    c.execute_batch("PRAGMA foreign_keys=ON").unwrap();
    db::migrate::run(&mut c).unwrap();
    c
}
fn items() -> Vec<CaptureItem> {
    let now = chrono::NaiveDateTime::parse_from_str("2026-10-20 14:30", "%Y-%m-%d %H:%M").unwrap();
    [EntityType::Idea, EntityType::Todo, EntityType::Tip, EntityType::Skill, EntityType::Prompt].into_iter().map(|kind| {
        let mut p=capture::normalize::build_preview(&json!({"items":[{"type":kind.table(),"title":"检索内容","confidence":"high","dateText":"明天下午3点","tools":["Codex"],"url":"https://example.com","category":"写作","description":"简介"}]}).to_string(),&capture::normalize::Context {target:None,original:"检索内容 明天下午3点 https://example.com {{topic}}",forced:None,now,existing_tags:&[],known_tools:&["Codex".into()]},false).unwrap();
        let mut item=p.items.remove(0);item.tags=vec!["测试标签".into()];
        if kind==EntityType::Skill {item.skill_content=Some("---\nname: test\n---\n原文".into());}
        item
    }).collect()
}
#[test]
fn commit_maps_five_types_and_undo_preserves_edits() {
    let mut c = database();
    let input = items();
    let prepared = prepare_items(input.clone()).unwrap();
    let tx = c.transaction().unwrap();
    let saved = persistence::commit(&tx, &prepared, 100).unwrap();
    tx.commit().unwrap();
    assert_eq!(saved.refs.len(), 5);
    assert_eq!(repo::search::query(&c, "检索内容", 8).unwrap().len(), 5);
    for (r, item) in saved.refs.iter().zip(&input) {
        match r.entity_type {
            EntityType::Material => panic!("Original five-type fixture excludes materials"),
            EntityType::Idea => {
                let v = repo::ideas::get(&c, &r.id).unwrap();
                assert_eq!(v.content_md, item.body);
                assert_eq!(v.date, item.date.clone().unwrap());
            }
            EntityType::Todo => {
                let v = repo::todos::get(&c, &r.id).unwrap();
                assert_eq!(v.title, item.title);
                assert_eq!(v.note_md, item.body);
                assert_eq!(v.due_date, item.due_date);
                assert_eq!(v.remind_at, item.remind_at);
                assert_eq!(v.priority, 2);
            }
            EntityType::Tip => {
                let v = repo::tips::get(&c, &r.id).unwrap();
                assert_eq!(v.content_md, item.body);
                assert_eq!(v.tools, ["Codex"]);
                assert_eq!(v.source_url, item.url);
            }
            EntityType::Skill => {
                let v = repo::skills::get(&c, &r.id).unwrap();
                assert_eq!(v.note, item.body);
                assert_eq!(v.content_md, item.skill_content);
                assert_eq!(v.source_type, "both");
                assert_eq!(v.description, item.description);
            }
            EntityType::Prompt => {
                let v = repo::prompts::get(&c, &r.id).unwrap();
                assert_eq!(v.body, item.body);
                assert_eq!(v.variables, ["topic"]);
                assert_eq!(v.category, "写作");
            }
        }
        let times: (i64, i64) = c
            .query_row(
                &format!(
                    "SELECT created_at,updated_at FROM {} WHERE id=?",
                    r.entity_type.table()
                ),
                [&r.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(times, (100, 100));
        assert_eq!(
            repo::common::load_tags_for(&c, r.entity_type, std::slice::from_ref(&r.id)).unwrap()
                [&r.id][0]
                .name,
            "测试标签"
        );
    }
    c.execute("UPDATE idea SET updated_at=101", []).unwrap();
    let tx = c.transaction().unwrap();
    let undo = CaptureUndoInput {
        refs: saved.refs,
        created_at: 100,
    };
    let result = persistence::undo(&tx, &undo, 102).unwrap();
    tx.commit().unwrap();
    assert_eq!((result.removed, result.skipped), (4, 1));
    assert!(repo::trash::list(&c).unwrap().is_empty());
    assert_eq!(repo::search::query(&c, "检索内容", 8).unwrap().len(), 1);
    let tx = c.transaction().unwrap();
    let result = persistence::undo(&tx, &undo, 103).unwrap();
    assert_eq!((result.removed, result.skipped), (0, 5));
}
#[test]
fn invalid_batch_never_writes_and_repo_failure_rolls_back() {
    let mut c = database();
    let mut input = items();
    input[1].title.clear();
    assert!(prepare_items(input).is_err());
    assert_eq!(
        c.query_row("SELECT count(*) FROM idea", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert!(prepare_items(vec![]).is_err());
    assert!(prepare_items(vec![items()[0].clone(); 11]).is_err());
    let prepared = prepare_items(items()).unwrap();
    c.execute_batch("CREATE TRIGGER fail_tip BEFORE INSERT ON tip BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
    {
        let tx = c.transaction().unwrap();
        assert!(persistence::commit(&tx, &prepared, 100).is_err());
    }
    assert_eq!(
        c.query_row("SELECT count(*) FROM idea", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        c.query_row("SELECT count(*) FROM search_index", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
}
#[test]
fn undo_guards_timestamp_deleted_and_added_subtasks() {
    let mut c = database();
    let prepared = prepare_items(items()).unwrap();
    let tx = c.transaction().unwrap();
    let saved = persistence::commit(&tx, &prepared, 100).unwrap();
    tx.commit().unwrap();
    c.execute("UPDATE idea SET deleted_at=101", []).unwrap();
    let parent = saved.refs[1].clone();
    let tx = c.transaction().unwrap();
    repo::todos::create(
        &tx,
        &TodoInput {
            title: "后来添加的子任务".into(),
            priority: 2,
            parent_id: Some(parent.id.clone()),
            ..Default::default()
        },
        101,
        None,
    )
    .unwrap();
    tx.commit().unwrap();
    let tx = c.transaction().unwrap();
    let wrong = persistence::undo(
        &tx,
        &CaptureUndoInput {
            refs: saved.refs.clone(),
            created_at: 99,
        },
        102,
    )
    .unwrap();
    assert_eq!((wrong.removed, wrong.skipped), (0, 5));
    let result = persistence::undo(
        &tx,
        &CaptureUndoInput {
            refs: saved.refs,
            created_at: 100,
        },
        103,
    )
    .unwrap();
    assert_eq!((result.removed, result.skipped), (3, 2));
    assert_eq!(repo::todos::children(&tx, &parent.id).unwrap().len(), 1);
    let missing = EntityRef {
        entity_type: EntityType::Idea,
        id: "missing".into(),
    };
    assert!(!repo::common::capture_unchanged(&tx, &missing, 100).unwrap());
}

#[test]
fn material_commit_maps_component_fields_and_undo_protects_attached_files() {
    let mut c = database();
    let mut item = items().remove(0);
    item.kind = EntityType::Material;
    item.material_kind = Some("component".into());
    item.material_prompt = "检索内容".into();
    let prepared = prepare_items(vec![item.clone(), item.clone()]).unwrap();
    let tx = c.transaction().unwrap();
    let saved = persistence::commit(&tx, &prepared, 100).unwrap();
    let material = repo::materials::get(&tx, &saved.refs[0].id).unwrap();
    assert_eq!(material.kind, "component");
    assert_eq!(material.note_md, item.body);
    assert_eq!(material.prompt, item.material_prompt);
    assert_eq!(material.url, item.url);
    assert_eq!(material.tags[0].name, "测试标签");
    // A same-millisecond file attachment is protected even before its parent timestamp changes.
    tx.execute("INSERT INTO material_asset(id,material_id,media_kind,mime,file_name,original_name,size_bytes,sha256,created_at) VALUES ('asset',?,'image','image/png','2026/10/asset.png','a.png',8,'hash',100)",[&material.id]).unwrap();
    let result = persistence::undo(
        &tx,
        &CaptureUndoInput {
            refs: saved.refs,
            created_at: 100,
        },
        101,
    )
    .unwrap();
    assert_eq!((result.removed, result.skipped), (1, 1));
    assert_eq!(
        repo::materials::get(&tx, &material.id)
            .unwrap()
            .assets
            .len(),
        1
    );
}
