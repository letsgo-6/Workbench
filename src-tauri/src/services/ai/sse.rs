use crate::error::{AppError, AppResult, ErrorCode};
/// Network chunks may split anywhere, including inside a UTF-8 character.
#[derive(Default)]
pub struct Decoder {
    buffer: Vec<u8>,
    data: Vec<String>,
    pub done: bool,
    with_reasoning: bool,
}
#[derive(Debug, PartialEq)]
pub enum Chunk {
    Text(String),
    Reasoning(String),
    Finish(Option<String>),
}
impl Decoder {
    pub fn with_reasoning() -> Self {
        Self {
            with_reasoning: true,
            ..Self::default()
        }
    }
    /// Decode complete SSE events, retaining incomplete lines.
    pub fn push(&mut self, bytes: &[u8], eof: bool) -> AppResult<Vec<Chunk>> {
        self.buffer.extend_from_slice(bytes);
        if self.buffer.len() > 2_000_000 {
            return Err(AppError::coded(
                ErrorCode::AiBadResponse,
                "SSE event too large",
            ));
        }
        let mut output = vec![];
        while let Some(end) = self.buffer.iter().position(|b| *b == b'\n') {
            let line = self.buffer.drain(..=end).collect::<Vec<_>>();
            self.line(&line[..line.len() - 1], &mut output)?;
        }
        if eof {
            let remaining = std::mem::take(&mut self.buffer);
            if !remaining.is_empty() {
                self.line(&remaining, &mut output)?;
            }
            self.dispatch(&mut output)?;
        }
        Ok(output)
    }
    fn line(&mut self, line: &[u8], output: &mut Vec<Chunk>) -> AppResult<()> {
        let line = std::str::from_utf8(line)
            .map_err(|_| AppError::coded(ErrorCode::AiBadResponse, "Invalid UTF-8 stream"))?
            .trim_end_matches('\r');
        if line.is_empty() {
            self.dispatch(output)?;
        } else if let Some(data) = line.strip_prefix("data:") {
            self.data
                .push(data.strip_prefix(' ').unwrap_or(data).into());
        }
        Ok(())
    }
    fn dispatch(&mut self, output: &mut Vec<Chunk>) -> AppResult<()> {
        if self.data.is_empty() || self.done {
            return Ok(());
        }
        let data = std::mem::take(&mut self.data).join("\n");
        if data.trim() == "[DONE]" {
            self.done = true;
            return Ok(());
        }
        let value: serde_json::Value = serde_json::from_str(&data)
            .map_err(|_| AppError::coded(ErrorCode::AiBadResponse, "Invalid stream event"))?;
        if value.get("error").is_some() {
            return Err(AppError::coded(
                ErrorCode::AiProvider,
                "Provider returned an error event",
            ));
        }
        if self.with_reasoning
            && let Some(text) = value
                .pointer("/choices/0/delta/reasoning_content")
                .and_then(|v| v.as_str())
            && !text.is_empty()
        {
            output.push(Chunk::Reasoning(text.into()));
        }
        if let Some(text) = value
            .pointer("/choices/0/delta/content")
            .and_then(|v| v.as_str())
            && !text.is_empty()
        {
            output.push(Chunk::Text(text.into()));
        }
        if let Some(reason) = value
            .pointer("/choices/0/finish_reason")
            .and_then(|v| v.as_str())
        {
            output.push(Chunk::Finish(Some(reason.into())));
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn split_utf8_crlf_and_multiple_events() {
        let wire = "data: {\"choices\":[{\"delta\":{\"content\":\"中文\",\"reasoning_content\":\"hidden\"}}]}\r\n\r\ndata: {\"choices\":[{\"delta\":{}}]}\n\ndata: [DONE]\n\n";
        let mut d = Decoder::default();
        let mut out = vec![];
        for byte in wire.bytes() {
            out.extend(d.push(&[byte], false).unwrap());
        }
        assert_eq!(out, vec![Chunk::Text("中文".into())]);
        assert!(d.done);
    }
    #[test]
    fn eof_and_error() {
        let mut d = Decoder::default();
        assert_eq!(
            d.push(
                b"data: {\"choices\":[{\"delta\":{\"content\":\"x\"}}]}",
                true
            )
            .unwrap(),
            vec![Chunk::Text("x".into())]
        );
        assert!(
            Decoder::default()
                .push(b"data: {\"error\":{\"message\":\"secret\"}}\n\n", false)
                .is_err()
        );
    }
    #[test]
    fn reasoning_requires_opt_in_and_survives_split_utf8() {
        let wire = "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"先辨认中文\",\"content\":\"输出\"}}]}\r\n\r\ndata: [DONE]\n\n";
        let mut decoder = Decoder::with_reasoning();
        let mut chunks = vec![];
        for byte in wire.bytes() {
            chunks.extend(decoder.push(&[byte], false).unwrap());
        }
        assert_eq!(
            chunks,
            vec![
                Chunk::Reasoning("先辨认中文".into()),
                Chunk::Text("输出".into())
            ]
        );
        assert!(decoder.done);
    }
}
