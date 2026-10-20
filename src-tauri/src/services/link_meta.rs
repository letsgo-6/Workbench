use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
/// Fetch only a bounded HTML response; failure is optional metadata.
pub async fn title(url: &str) -> AppResult<Option<String>> {
    let url = reqwest::Url::parse(url).map_err(|e| AppError::Invalid(e.to_string()))?;
    if !["http", "https"].contains(&url.scheme()) {
        return Err(AppError::Invalid("Unsupported URL scheme".into()));
    }
    if url.host_str() == Some("github.com") {
        let parts: Vec<_> = url.path_segments().into_iter().flatten().collect();
        if let Some(last) = parts.last() {
            return Ok(Some(if last.eq_ignore_ascii_case("SKILL.md") {
                parts
                    .get(parts.len().saturating_sub(2))
                    .unwrap_or(last)
                    .to_string()
            } else {
                last.to_string()
            }));
        }
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Network(e.to_string()))?
        .error_for_status()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let mut bytes = vec![];
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::Network(e.to_string()))?;
        if bytes.len() + chunk.len() > 1048576 {
            break;
        }
        bytes.extend_from_slice(&chunk);
    }
    let html = String::from_utf8_lossy(&bytes);
    let lower = html.to_lowercase();
    let title = lower
        .find("<title")
        .and_then(|start| lower[start..].find('>').map(|o| start + o + 1))
        .and_then(|start| {
            lower[start..]
                .find("</title>")
                .map(|end| html[start..start + end].trim().to_string())
        });
    Ok(title.map(|s| {
        html_escape::decode_html_entities(&s)
            .chars()
            .take(500)
            .collect()
    }))
}
