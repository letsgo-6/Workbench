use super::*;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{header, method, path},
};
fn provider(url: String) -> ProviderView {
    ProviderView {
        id: "test".into(),
        name: "test".into(),
        base_url: url,
        model: "test-model".into(),
        temperature: 0.7,
        max_tokens: None,
        is_default: true,
        has_key: true,
        key_hint: None,
    }
}
fn messages() -> Vec<ChatMessage> {
    vec![ChatMessage {
        role: "user".into(),
        content: "test".into(),
    }]
}
#[tokio::test]
async fn stream_success_authorization_and_secret_redaction() {
    let server = MockServer::start().await;
    let key = "test-secret-for-wiremock-only";
    Mock::given(method("POST")).and(path("/chat/completions")).and(header("Authorization",format!("Bearer {key}"))).respond_with(ResponseTemplate::new(200).set_body_string(format!("data: {{\"choices\":[{{\"delta\":{{\"content\":\"你好 {key}\"}}}}]}}\n\ndata: [DONE]\n\n"))).expect(1).mount(&server).await;
    let service = AiService::new(&NetworkProxy {
        mode: "none".into(),
        url: None,
    })
    .unwrap();
    let events = Mutex::new(vec![]);
    service
        .run(
            "a",
            provider(server.uri()),
            key.into(),
            messages(),
            false,
            |e| {
                events.lock().push(serde_json::to_value(e).unwrap());
                true
            },
        )
        .await
        .unwrap();
    let text = serde_json::to_string(&*events.lock()).unwrap();
    assert!(text.contains("你好") && text.contains("[REDACTED]") && !text.contains(key));
    assert!(service.requests.lock().is_empty());
    let request = &server.received_requests().await.unwrap()[0];
    let body: serde_json::Value = serde_json::from_slice(&request.body).unwrap();
    assert!(body.get("stream_options").is_none() && body.get("max_tokens").is_none());
}
#[tokio::test]
async fn status_mapping_timeout_and_cancel() {
    for (status, code) in [
        (401, ErrorCode::AiAuth),
        (403, ErrorCode::AiAuth),
        (404, ErrorCode::AiEndpoint),
        (429, ErrorCode::AiRateLimit),
        (500, ErrorCode::AiProvider),
    ] {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(status)
                    .set_body_json(serde_json::json!({"error":{"message":"credential-echo"}})),
            )
            .mount(&server)
            .await;
        let client = client::build(&NetworkProxy {
            mode: "none".into(),
            url: None,
        })
        .unwrap();
        let e = client::chat(
            &client,
            &provider(server.uri()),
            "credential-echo",
            &messages(),
            true,
        )
        .await
        .unwrap_err();
        assert_eq!(format!("{:?}", e.code()), format!("{code:?}"));
        assert!(
            !serde_json::to_string(&e)
                .unwrap()
                .contains("credential-echo")
        );
    }
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_delay(Duration::from_secs(1))
                .set_body_string("data: [DONE]\n\n"),
        )
        .mount(&server)
        .await;
    let mut service = AiService::new(&NetworkProxy {
        mode: "none".into(),
        url: None,
    })
    .unwrap();
    service.idle_timeout = Duration::from_millis(30);
    let events = Mutex::new(vec![]);
    service
        .run(
            "timeout",
            provider(server.uri()),
            "k".into(),
            messages(),
            false,
            |e| {
                events.lock().push(serde_json::to_string(&e).unwrap());
                true
            },
        )
        .await
        .unwrap();
    assert!(events.lock().iter().any(|s| s.contains("TIMEOUT")));
    service.idle_timeout = Duration::from_secs(5);
    let run = service.run(
        "cancel",
        provider(server.uri()),
        "k".into(),
        messages(),
        false,
        |e| {
            events.lock().push(serde_json::to_string(&e).unwrap());
            true
        },
    );
    let cancel = async {
        tokio::time::sleep(Duration::from_millis(20)).await;
        service.cancel("cancel");
    };
    let (result, _) = tokio::join!(run, cancel);
    result.unwrap();
    assert!(events.lock().iter().any(|s| s.contains("cancelled")));
    assert!(service.requests.lock().is_empty());
}
#[test]
fn credential_split_across_deltas() {
    let mut r = Redactor::new("secret-key");
    assert_eq!(r.push("text sec", false), "text ");
    assert_eq!(r.push("ret-key end", false), "[REDACTED] end");
}
#[tokio::test]
async fn reasoning_is_opt_in_redacted_independently_and_never_becomes_content() {
    let server = MockServer::start().await;
    let key = "secret-key";
    let wire = [
        serde_json::json!({"reasoning_content":"推理 sec"}),
        serde_json::json!({"content":"正文 sec"}),
        serde_json::json!({"reasoning_content":"ret-key 完毕"}),
        serde_json::json!({"content":"ret-key 完成"}),
    ]
    .into_iter()
    .map(|delta| {
        format!(
            "data: {}\n\n",
            serde_json::json!({"choices":[{"delta":delta}]})
        )
    })
    .collect::<String>()
        + "data: [DONE]\n\n";
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_string(wire))
        .mount(&server)
        .await;
    let service = AiService::new(&NetworkProxy {
        mode: "none".into(),
        url: None,
    })
    .unwrap();
    for enabled in [false, true] {
        let events = Mutex::new(vec![]);
        let sink = |event| {
            events.lock().push(event);
            true
        };
        if enabled {
            service
                .run_with_reasoning(
                    "reasoning",
                    provider(server.uri()),
                    key.into(),
                    messages(),
                    false,
                    sink,
                )
                .await
                .unwrap();
        } else {
            service
                .run(
                    "ordinary",
                    provider(server.uri()),
                    key.into(),
                    messages(),
                    false,
                    sink,
                )
                .await
                .unwrap();
        }
        let events = events.lock();
        let reasoning = events
            .iter()
            .filter_map(|e| {
                if let AiStreamEvent::Reasoning { text } = e {
                    Some(text.as_str())
                } else {
                    None
                }
            })
            .collect::<String>();
        let content = events
            .iter()
            .filter_map(|e| {
                if let AiStreamEvent::Delta { text } = e {
                    Some(text.as_str())
                } else {
                    None
                }
            })
            .collect::<String>();
        assert_eq!(content, "正文 [REDACTED] 完成");
        assert_eq!(
            reasoning,
            if enabled {
                "推理 [REDACTED] 完毕"
            } else {
                ""
            }
        );
        assert!(!serde_json::to_string(&*events).unwrap().contains(key));
        assert!(service.requests.lock().is_empty());
    }
}
