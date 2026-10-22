use super::*;
use crate::{db, domain::settings::NetworkProxy, services::data};
use rusqlite::Connection;
use serde_json::json;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{header, method, path},
};
fn clock() -> NaiveDateTime {
    NaiveDateTime::parse_from_str("2026-10-20 14:30", "%Y-%m-%d %H:%M").unwrap()
}
fn database() -> Connection {
    let mut c = Connection::open_in_memory().unwrap();
    db::migrate::run(&mut c).unwrap();
    let tx = c.transaction().unwrap();
    ai::actions::seed_system_templates(&tx).unwrap();
    repo::settings::set(&tx, "tips.customTools", &json!(["测试工具"])).unwrap();
    tx.commit().unwrap();
    c
}
fn provider(url: String) -> ProviderView {
    ProviderView {
        id: "test".into(),
        name: "test".into(),
        base_url: url,
        model: "test".into(),
        temperature: 0.7,
        max_tokens: None,
        is_default: true,
        has_key: true,
        key_hint: None,
    }
}
#[tokio::test]
async fn full_analysis_stream_renders_time_tools_and_keeps_db_unchanged() {
    let c = database();
    let before = serde_json::to_value(data::export(&c).unwrap()).unwrap()["data"].clone();
    let server = MockServer::start().await;
    let answer=json!({"items":[{"type":"idea","confidence":"low","source":"编造","dateText":"明天下午3点前"},{"type":"tip"}]}).to_string();
    let body = format!(
        "data: {}\n\ndata: [DONE]\n\n",
        json!({"choices":[{"delta":{"content":answer}}]})
    );
    Mock::given(method("POST"))
        .and(path("/chat/completions"))
        .and(header("Authorization", "Bearer test-only-key"))
        .respond_with(ResponseTemplate::new(200).set_body_string(body))
        .expect(1)
        .mount(&server)
        .await;
    let service = ai::AiService::new(&NetworkProxy {
        mode: "none".into(),
        url: None,
    })
    .unwrap();
    let p = analyze(
        &service,
        "analysis",
        provider(server.uri()),
        "test-only-key".into(),
        prepare(&c, "待办：明天下午3点前交材料", clock()).unwrap(),
    )
    .await
    .unwrap();
    assert_eq!(p.items.len(), 1);
    assert_eq!(p.items[0].kind, EntityType::Todo);
    assert_eq!(p.items[0].due_date.as_deref(), Some("2026-10-21"));
    let request = &server.received_requests().await.unwrap()[0];
    let body: serde_json::Value = serde_json::from_slice(&request.body).unwrap();
    let prompt = body["messages"][1]["content"].as_str().unwrap();
    assert!(prompt.contains("2026-10-20 14:30 星期二"));
    assert!(prompt.contains("Claude Code、Cursor、ChatGPT、Codex、测试工具"));
    assert!(!prompt.contains("{{now}}") && !prompt.contains("{{known_tools}}"));
    let user_input = prompt
        .split("<input>\n")
        .nth(1)
        .unwrap()
        .split("\n</input>")
        .next()
        .unwrap();
    assert_eq!(user_input, "明天下午3点前交材料");
    assert!(!user_input.contains("待办："));
    assert_eq!(
        serde_json::to_value(data::export(&c).unwrap()).unwrap()["data"],
        before
    );
}
#[tokio::test]
async fn analysis_maps_auth_cancel_and_malformed_json() {
    let c = database();
    let service = ai::AiService::new(&NetworkProxy {
        mode: "none".into(),
        url: None,
    })
    .unwrap();
    for (status, body, expected) in [
        (
            401,
            "{\"error\":{\"message\":\"private text\"}}",
            ErrorCode::AiAuth,
        ),
        (
            200,
            "data: {\"choices\":[{\"delta\":{\"content\":\"bad JSON\"}}]}\n\ndata: [DONE]\n\n",
            ErrorCode::AiBadResponse,
        ),
    ] {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(status).set_body_string(body))
            .mount(&server)
            .await;
        let err = analyze(
            &service,
            "request",
            provider(server.uri()),
            "test-key".into(),
            prepare(&c, "隐私原文", clock()).unwrap(),
        )
        .await
        .unwrap_err();
        assert_eq!(format!("{:?}", err.code()), format!("{expected:?}"));
        assert!(!err.to_string().contains("private text"));
    }
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_delay(std::time::Duration::from_secs(2))
                .set_body_string("data: [DONE]\n\n"),
        )
        .mount(&server)
        .await;
    let run = analyze(
        &service,
        "cancel",
        provider(server.uri()),
        "test-key".into(),
        prepare(&c, "取消时保留", clock()).unwrap(),
    );
    let cancel = async {
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
        service.cancel("cancel");
    };
    let (result, _) = tokio::join!(run, cancel);
    assert!(matches!(result.unwrap_err().code(), ErrorCode::Cancelled));
}
#[test]
fn old_templates_settings_and_backup_roundtrip() {
    let mut c = database();
    c.execute("DELETE FROM prompt WHERE template_key='smart_capture'", [])
        .unwrap();
    c.execute(
        "UPDATE prompt SET body='custom {{input}}' WHERE template_key='polish'",
        [],
    )
    .unwrap();
    let tx = c.transaction().unwrap();
    ai::actions::seed_system_templates(&tx).unwrap();
    assert_eq!(ai::actions::list(&tx).unwrap().len(), 13);
    assert_eq!(ai::actions::list(&tx).unwrap()[0].body, "custom {{input}}");
    let defaults = repo::settings::get_all(&tx).unwrap();
    assert!(defaults.capture_default_target == EntityType::Idea && !defaults.capture_auto_save);
    for key in ["capture.defaultTarget", "capture.autoSave"] {
        for value in [json!("true"), json!(1), json!(null)] {
            assert!(repo::settings::set(&tx, key, &value).is_err());
        }
    }
    repo::settings::set(&tx, "capture.defaultTarget", &json!("skill")).unwrap();
    repo::settings::set(&tx, "capture.autoSave", &json!(true)).unwrap();
    tx.commit().unwrap();
    let backup = data::export(&c).unwrap();
    let mut target = database();
    let tx = target.transaction().unwrap();
    data::apply(&tx, &backup, "overwrite").unwrap();
    tx.commit().unwrap();
    let settings = repo::settings::get_all(&target).unwrap();
    assert!(settings.capture_default_target == EntityType::Skill && settings.capture_auto_save);
    let mut old = serde_json::to_value(&backup).unwrap();
    old["data"]["prompts"]
        .as_array_mut()
        .unwrap()
        .retain(|p| p["template_key"] != "smart_capture");
    old["data"]["settings"]
        .as_object_mut()
        .unwrap()
        .retain(|k, _| !k.starts_with("capture."));
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("v020.json");
    std::fs::write(&path, serde_json::to_vec(&old).unwrap()).unwrap();
    let parsed = data::read(&target, &path).unwrap();
    let tx = target.transaction().unwrap();
    data::apply(&tx, &parsed, "overwrite").unwrap();
    tx.commit().unwrap();
    assert_eq!(ai::actions::list(&target).unwrap().len(), 13);
    assert_eq!(
        ai::actions::list(&target).unwrap()[0].body,
        "custom {{input}}"
    );
    let tx = target.transaction().unwrap();
    ai::actions::reset(&tx, "smart_capture").unwrap();
    assert_eq!(
        crate::services::template::variables(&ai::actions::list(&tx).unwrap()[12].body),
        ["now", "existing_tags", "known_tools", "input"]
    );
    let ts = include_str!("../../../../src/lib/tools.ts");
    let array = ts.split_once('[').unwrap().1.split_once(']').unwrap().0;
    let names = regex::Regex::new("'([^']+)'")
        .unwrap()
        .captures_iter(array)
        .map(|c| c[1].to_string())
        .collect::<Vec<_>>();
    assert_eq!(names, PRESET_TOOLS);
}
#[test]
fn explicit_target_wins_over_prefix_and_appends_hint() {
    let c = database();
    let a = prepare_for(&c, "待办：/compact 用法", Some(EntityType::Tip), clock()).unwrap();
    assert_eq!(a.target, Some(EntityType::Tip));
    assert_eq!(a.forced, Some(EntityType::Todo));
    assert_eq!(a.original, "/compact 用法");
    assert!(
        a.messages
            .last()
            .unwrap()
            .content
            .ends_with(&target_hint(EntityType::Tip))
    );
    let plain = prepare(&c, "待办：交材料", clock()).unwrap();
    assert_eq!(plain.forced, Some(EntityType::Todo));
    assert!(
        !plain
            .messages
            .last()
            .unwrap()
            .content
            .contains("用户已指定")
    );
}

#[test]
fn target_guidance_survives_custom_template_and_legacy_settings_are_ignored() {
    let mut c = database();
    c.execute(
        "UPDATE prompt SET body='custom {{input}}' WHERE template_key='smart_capture'",
        [],
    )
    .unwrap();
    for (kind, terms) in [
        (EntityType::Idea, vec!["dateText", "body"]),
        (EntityType::Todo, vec!["title", "priority", "dateText"]),
        (EntityType::Skill, vec!["SKILL.md", "description", "url"]),
        (EntityType::Prompt, vec!["body", "{{变量}}", "category"]),
        (EntityType::Tip, vec!["tools", "title"]),
        (EntityType::Material, vec!["work", "component", "逐字摘录"]),
    ] {
        let a = prepare_for(&c, "素材原文", Some(kind), clock()).unwrap();
        let last = &a.messages.last().unwrap().content;
        assert!(last.starts_with("custom 素材原文"));
        assert!(last.contains("最多 10 条同类型"));
        for term in terms {
            assert!(last.contains(term), "{kind:?}: {term}");
        }
    }
    let tx = c.transaction().unwrap();
    for kind in EntityType::ALL {
        assert_eq!(
            repo::settings::set(&tx, "capture.defaultTarget", &json!(kind.table()))
                .unwrap()
                .capture_default_target,
            kind
        );
    }
    for value in [
        json!(true),
        json!(1),
        json!(null),
        json!("unknown"),
        json!("Skill"),
        json!({}),
    ] {
        assert!(repo::settings::set(&tx, "capture.defaultTarget", &value).is_err());
    }
    assert!(repo::settings::set(&tx, "capture.smartDefault", &json!(false)).is_err());
    tx.commit().unwrap();
    let mut backup = data::export(&c).unwrap();
    backup.data["settings"]
        .as_object_mut()
        .unwrap()
        .insert("capture.smartDefault".into(), json!(false));
    backup.data["settings"]
        .as_object_mut()
        .unwrap()
        .remove("capture.defaultTarget");
    let mut target = database();
    let tx = target.transaction().unwrap();
    data::apply(&tx, &backup, "overwrite").unwrap();
    tx.commit().unwrap();
    assert_eq!(
        repo::settings::get_all(&target)
            .unwrap()
            .capture_default_target,
        EntityType::Idea
    );
    assert!(
        data::export(&target).unwrap().data["settings"]
            .get("capture.smartDefault")
            .is_none()
    );
}
#[tokio::test]
async fn streamed_reasoning_is_separate_from_preview_and_does_not_persist() {
    let c = database();
    let before = serde_json::to_value(data::export(&c).unwrap()).unwrap()["data"].clone();
    let server = MockServer::start().await;
    let content =
        json!({"items":[{"type":"idea","source":"模型改写","confidence":"high"}]}).to_string();
    let wire = format!(
        "data: {}\n\ndata: [DONE]\n\n",
        json!({"choices":[{"delta":{"reasoning_content":"秘密推理 test-only-key","content":content}}]})
    );
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_string(wire))
        .mount(&server)
        .await;
    let service = ai::AiService::new(&NetworkProxy {
        mode: "none".into(),
        url: None,
    })
    .unwrap();
    let events = parking_lot::Mutex::new(Vec::new());
    let preview = analyze_with(
        &service,
        "stream-reasoning",
        provider(server.uri()),
        "test-only-key".into(),
        prepare_for(&c, "用户原文", Some(EntityType::Idea), clock()).unwrap(),
        |e| events.lock().push(serde_json::to_value(e).unwrap()),
    )
    .await
    .unwrap();
    assert_eq!(preview.items[0].body, "用户原文");
    let events = events.lock();
    assert!(
        events
            .iter()
            .any(|e| e["type"] == "reasoning" && e["text"] == "秘密推理 [REDACTED]")
    );
    assert!(
        !serde_json::to_string(&*events)
            .unwrap()
            .contains("test-only-key")
    );
    assert_eq!(
        serde_json::to_value(data::export(&c).unwrap()).unwrap()["data"],
        before
    );
}
