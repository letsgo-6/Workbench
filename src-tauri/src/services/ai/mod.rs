pub mod actions;
pub mod chat;
pub mod client;
pub mod context;
pub mod parse;
pub mod sse;
#[cfg(test)]
mod tests;
use crate::{
    domain::{ai::*, provider::ProviderView, settings::NetworkProxy},
    error::{AppError, AppResult, ErrorCode},
};
use futures_util::StreamExt;
use parking_lot::{Mutex, RwLock};
use std::{collections::HashMap, time::Duration};
use tokio_util::sync::CancellationToken;
/// Shared HTTP transport and request-scoped cancellation; conversations stay in memory.
pub struct AiService {
    client: RwLock<reqwest::Client>,
    requests: Mutex<HashMap<String, CancellationToken>>,
    pub idle_timeout: Duration,
}
impl AiService {
    /// Configure the transport from the user's proxy setting.
    pub fn new(proxy: &NetworkProxy) -> AppResult<Self> {
        Ok(Self {
            client: RwLock::new(client::build(proxy)?),
            requests: Mutex::new(HashMap::new()),
            idle_timeout: Duration::from_secs(60),
        })
    }
    /// Atomically switch clients; ongoing requests may finish on their original client.
    pub fn configure(&self, proxy: &NetworkProxy) -> AppResult<()> {
        let client = client::build(proxy)?;
        *self.client.write() = client;
        Ok(())
    }
    /// Clone transport without holding its lock across an await.
    pub fn client(&self) -> reqwest::Client {
        self.client.read().clone()
    }
    /// Cancel a known request; already completed requests are harmless.
    pub fn cancel(&self, id: &str) {
        if let Some(token) = self.requests.lock().get(id) {
            token.cancel();
        }
    }
    /// Stream through one isolated sink, always removing its cancellation entry.
    pub async fn run(
        &self,
        id: &str,
        provider: ProviderView,
        key: String,
        messages: Vec<ChatMessage>,
        truncated: bool,
        emit: impl Fn(AiStreamEvent) -> bool,
    ) -> AppResult<()> {
        let token = CancellationToken::new();
        {
            let mut requests = self.requests.lock();
            if requests.contains_key(id) || requests.len() >= 8 {
                return Err(AppError::Invalid(
                    "Duplicate request or too many active requests".into(),
                ));
            }
            requests.insert(id.into(), token.clone());
        }
        emit(AiStreamEvent::Started {
            model: provider.model.replace(&key, "[REDACTED]"),
            truncated,
        });
        let work = self.stream(&provider, &key, &messages, &emit);
        let outcome = tokio::select! {biased;_=token.cancelled()=>None,result=work=>Some(result)};
        self.requests.lock().remove(id);
        match outcome {
            None => {
                emit(AiStreamEvent::Cancelled);
            }
            Some(Ok(reason)) => {
                emit(AiStreamEvent::Done {
                    finish_reason: reason,
                });
            }
            Some(Err(e)) => {
                log::warn!(target:"workbench", "AI request ended with safe code {:?}",e.code());
                emit(AiStreamEvent::Error { error: e.payload() });
            }
        }
        Ok(())
    }
    async fn stream(
        &self,
        provider: &ProviderView,
        key: &str,
        messages: &[ChatMessage],
        emit: &impl Fn(AiStreamEvent) -> bool,
    ) -> AppResult<Option<String>> {
        let client = self.client();
        let first_deadline = tokio::time::Instant::now() + self.idle_timeout;
        let response = tokio::time::timeout(
            self.idle_timeout,
            client::chat(&client, provider, key, messages, true),
        )
        .await
        .map_err(|_| AppError::coded(ErrorCode::Timeout, "AI first response timed out"))??;
        let mut stream = response.bytes_stream();
        let mut decoder = sse::Decoder::default();
        let mut reason = None;
        let mut redactor = Redactor::new(key);
        let mut size = 0;
        let mut first = true;
        loop {
            let deadline = if first {
                first_deadline
            } else {
                tokio::time::Instant::now() + self.idle_timeout
            };
            let next = tokio::time::timeout_at(deadline, stream.next())
                .await
                .map_err(|_| AppError::coded(ErrorCode::Timeout, "AI stream stalled"))?;
            let eof = next.is_none();
            first = false;
            let bytes = match next {
                Some(Ok(b)) => b.to_vec(),
                Some(Err(e)) => return Err(client::network(e)),
                None => vec![],
            };
            for chunk in decoder.push(&bytes, eof)? {
                match chunk {
                    sse::Chunk::Text(text) => {
                        size += text.len();
                        if size > 1_000_000 {
                            return Err(AppError::coded(
                                ErrorCode::AiBadResponse,
                                "AI output exceeds limit",
                            ));
                        }
                        let text = redactor.push(&text, false);
                        if !text.is_empty() && !emit(AiStreamEvent::Delta { text }) {
                            return Err(AppError::coded(ErrorCode::Internal, "AI receiver closed"));
                        }
                    }
                    sse::Chunk::Finish(r) => reason = r,
                }
            }
            if decoder.done || eof {
                let text = redactor.push("", true);
                if !text.is_empty() {
                    emit(AiStreamEvent::Delta { text });
                }
                if !decoder.done && reason.is_none() {
                    return Err(AppError::coded(
                        ErrorCode::AiBadResponse,
                        "Incomplete AI stream",
                    ));
                }
                return Ok(reason);
            }
        }
    }
}
// Hold only a possible credential prefix across delta boundaries, preserving streaming latency.
struct Redactor {
    key: String,
    pending: String,
}
impl Redactor {
    fn new(key: &str) -> Self {
        Self {
            key: key.into(),
            pending: String::new(),
        }
    }
    fn push(&mut self, text: &str, eof: bool) -> String {
        self.pending.push_str(text);
        let mut out = String::new();
        while !self.pending.is_empty() {
            if !self.key.is_empty() && self.pending.starts_with(&self.key) {
                out.push_str("[REDACTED]");
                self.pending.drain(..self.key.len());
            } else if !eof && self.key.starts_with(&self.pending) {
                break;
            } else {
                let n = self.pending.chars().next().map(char::len_utf8).unwrap_or(0);
                out.push_str(&self.pending[..n]);
                self.pending.drain(..n);
            }
        }
        out
    }
}
