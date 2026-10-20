use crate::{
    domain::{ai::ChatMessage, provider::*, settings::NetworkProxy},
    error::{AppError, AppResult, ErrorCode},
};
use reqwest::{
    Client, Response,
    header::{AUTHORIZATION, HeaderValue},
};
use std::time::Duration;
/// Build a reusable client. Redirects cannot forward credentials to another endpoint.
pub fn build(proxy: &NetworkProxy) -> AppResult<Client> {
    let mut b = Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none());
    match proxy.mode.as_str() {
        "none" => b = b.no_proxy(),
        "custom" => {
            let url = proxy
                .url
                .as_deref()
                .ok_or_else(|| AppError::Invalid("Missing proxy URL".into()))?;
            b = b.proxy(
                reqwest::Proxy::all(url)
                    .map_err(|_| AppError::Invalid("Invalid proxy URL".into()))?,
            );
        }
        _ => {}
    }
    b.build()
        .map_err(|_| AppError::coded(ErrorCode::Network, "HTTP client initialization failed"))
}
/// Error text never includes request URLs, headers or underlying network diagnostics.
pub fn network(error: reqwest::Error) -> AppError {
    if error.is_timeout() {
        AppError::coded(ErrorCode::Timeout, "AI request timed out")
    } else {
        AppError::coded(ErrorCode::Network, "Cannot connect to AI service")
    }
}
/// Put credentials only in a sensitive Authorization header.
pub fn authorization(key: &str) -> AppResult<HeaderValue> {
    let mut value = HeaderValue::from_str(&format!("Bearer {key}"))
        .map_err(|_| AppError::coded(ErrorCode::AiAuth, "Invalid API credential format"))?;
    value.set_sensitive(true);
    Ok(value)
}
/// Send the common Chat Completions shape without provider-specific fields.
pub async fn chat(
    client: &Client,
    provider: &ProviderView,
    key: &str,
    messages: &[ChatMessage],
    stream: bool,
) -> AppResult<Response> {
    let mut body = serde_json::json!({"model":provider.model,"messages":messages,"stream":stream,"temperature":provider.temperature});
    if let Some(max) = provider.max_tokens {
        body["max_tokens"] = max.into();
    }
    let response = client
        .post(format!(
            "{}/chat/completions",
            provider.base_url.trim_end_matches('/')
        ))
        .header(AUTHORIZATION, authorization(key)?)
        .json(&body)
        .send()
        .await
        .map_err(network)?;
    check(response, key).await
}
/// Bound all non-stream responses, including provider error bodies.
pub async fn bytes(mut response: Response) -> AppResult<Vec<u8>> {
    let mut out = vec![];
    while let Some(chunk) = response.chunk().await.map_err(network)? {
        if out.len() + chunk.len() > 2_000_000 {
            return Err(AppError::coded(
                ErrorCode::AiBadResponse,
                "Response too large",
            ));
        }
        out.extend_from_slice(&chunk);
    }
    Ok(out)
}
/// Translate statuses and redact a provider that echoes the supplied credential.
pub async fn check(response: Response, key: &str) -> AppResult<Response> {
    if response.status().is_success() {
        return Ok(response);
    }
    let status = response.status().as_u16();
    let (code, message) = match status {
        401 | 403 => (ErrorCode::AiAuth, "API Key 无效".into()),
        404 => (
            ErrorCode::AiEndpoint,
            "请检查 Base URL，通常以 /v1 结尾".into(),
        ),
        429 => (ErrorCode::AiRateLimit, "请求过于频繁，请稍后重试".into()),
        _ => {
            let raw = bytes(response).await.unwrap_or_default();
            let body: serde_json::Value = serde_json::from_slice(&raw).unwrap_or_default();
            let detail = body
                .pointer("/error/message")
                .and_then(|v| v.as_str())
                .unwrap_or("AI 服务返回错误");
            let safe = if key.is_empty() {
                detail.to_string()
            } else {
                detail.replace(key, "[REDACTED]")
            };
            (
                ErrorCode::AiProvider,
                safe.chars().take(500).collect::<String>(),
            )
        }
    };
    Err(AppError::Coded(code, message))
}
/// Fetch and sort model identifiers using the same credential boundary.
pub async fn models(
    client: &Client,
    input: &ProviderTestInput,
    key: &str,
) -> AppResult<Vec<String>> {
    let response = client
        .get(format!("{}/models", input.base_url.trim_end_matches('/')))
        .header(AUTHORIZATION, authorization(key)?)
        .send()
        .await
        .map_err(network)?;
    let data: serde_json::Value =
        serde_json::from_slice(&bytes(check(response, key).await?).await?)
            .map_err(|_| AppError::coded(ErrorCode::AiBadResponse, "Invalid model list"))?;
    let array = data
        .get("data")
        .and_then(|v| v.as_array())
        .ok_or_else(|| AppError::coded(ErrorCode::AiBadResponse, "Missing model list"))?;
    let mut models = array
        .iter()
        .filter_map(|v| v.get("id").and_then(|v| v.as_str()))
        .map(|v| v.replace(key, "[REDACTED]"))
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    Ok(models)
}
