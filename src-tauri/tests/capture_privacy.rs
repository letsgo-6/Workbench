use std::sync::Mutex;
use workbench_lib::{
    db,
    domain::{provider::ProviderView, settings::NetworkProxy},
    services::{ai::AiService, capture},
};
struct Logger(Mutex<Vec<String>>);
static LOGGER: Logger = Logger(Mutex::new(vec![]));
impl log::Log for Logger {
    fn enabled(&self, m: &log::Metadata<'_>) -> bool {
        m.target() == "workbench"
    }
    fn log(&self, r: &log::Record<'_>) {
        if self.enabled(r.metadata()) {
            self.0.lock().unwrap().push(format!("{}", r.args()));
        }
    }
    fn flush(&self) {}
}
#[tokio::test]
async fn capture_logs_never_include_input_output_or_key() {
    log::set_logger(&LOGGER).unwrap();
    log::set_max_level(log::LevelFilter::Trace);
    let text = "私密用户输入-CAPTURE-PRIVACY-ONLY";
    let output = "私密AI输出-CAPTURE-PRIVACY-ONLY";
    let key = "sk-capture-test-privacy-only";
    let mut conn = rusqlite::Connection::open_in_memory().unwrap();
    db::migrate::run(&mut conn).unwrap();
    let tx = conn.transaction().unwrap();
    workbench_lib::services::ai::actions::seed_system_templates(&tx).unwrap();
    tx.commit().unwrap();
    let server = wiremock::MockServer::start().await;
    let service = AiService::new(&NetworkProxy {
        mode: "none".into(),
        url: None,
    })
    .unwrap();
    for (status, streaming) in [(200, false), (401, false), (200, true), (401, true)] {
        server.reset().await;
        let answer =
            serde_json::json!({"items":[{"type":"idea","source":output,"confidence":"high"}]})
                .to_string();
        let body = if status == 200 {
            format!(
                "data: {}\n\ndata: [DONE]\n\n",
                serde_json::json!({"choices":[{"delta":{"content":answer,"reasoning_content":format!("私密推理 {key}")}}]})
            )
        } else {
            serde_json::json!({"error":{"message":format!("{text} {output} {key}")}}).to_string()
        };
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .respond_with(wiremock::ResponseTemplate::new(status).set_body_string(body))
            .mount(&server)
            .await;
        let provider = ProviderView {
            id: "privacy-test".into(),
            name: "test".into(),
            base_url: server.uri(),
            model: "test".into(),
            temperature: 0.7,
            max_tokens: None,
            is_default: true,
            has_key: true,
            key_hint: None,
        };
        let now =
            chrono::NaiveDateTime::parse_from_str("2026-10-20 14:30", "%Y-%m-%d %H:%M").unwrap();
        let events = Mutex::new(Vec::new());
        let analysis = capture::prepare(&conn, text, now).unwrap();
        let result = if streaming {
            capture::analyze_with(&service, "privacy", provider, key.into(), analysis, |e| {
                events
                    .lock()
                    .unwrap()
                    .push(serde_json::to_value(e).unwrap())
            })
            .await
        } else {
            capture::analyze(&service, "privacy", provider, key.into(), analysis).await
        };
        assert_eq!(result.is_ok(), status == 200);
        if let Ok(preview) = result {
            assert_eq!(preview.items[0].body, text);
            if streaming {
                let events = serde_json::to_string(&*events.lock().unwrap()).unwrap();
                assert!(events.contains("私密推理 [REDACTED]") && !events.contains(key));
            }
        }
    }
    let logs = LOGGER.0.lock().unwrap().join("\n");
    assert!(logs.contains("AI request ended with safe code AiAuth"));
    for secret in [text, output, key, "私密推理"] {
        assert!(!logs.contains(secret));
    }
}
