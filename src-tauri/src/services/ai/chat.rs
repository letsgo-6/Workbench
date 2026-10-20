use crate::{
    domain::ai::{AiChatInput, AiInput, ChatMessage},
    error::{AppError, AppResult},
    repo,
};
use rusqlite::Transaction;
/// Resolve selected entities, persist the user turn, and bound the actual model context.
pub fn prepare(
    tx: &Transaction<'_>,
    input: &AiChatInput,
    id: &str,
    provider: &str,
    key: &str,
    now: i64,
) -> AppResult<(Vec<ChatMessage>, bool)> {
    let text = input
        .messages
        .last()
        .filter(|m| m.role == "user")
        .map(|m| m.content.replace(key, "[REDACTED]"))
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| AppError::Invalid("A user message is required".into()))?;
    let limit = repo::settings::get_all(tx)?.ai_max_input_chars;
    if input.refs.len() > 20 {
        return Err(AppError::Invalid("Too many references".into()));
    }
    if !input.refs.is_empty() {
        super::context::build(
            tx,
            &AiInput::Entities {
                refs: input.refs.clone(),
            },
            limit / 2,
        )?;
    }
    repo::conversations::begin(tx, id, provider, &text, &input.refs, now)?;
    let history = repo::conversations::get(tx, id)?;
    let mut refs = vec![];
    for message in history.messages.iter().rev() {
        for r in &message.refs {
            if refs.len() < 20
                && !refs.iter().any(|old: &crate::domain::common::EntityRef| {
                    old.id == r.id && old.entity_type == r.entity_type
                })
                && super::context::build(
                    tx,
                    &AiInput::Entities {
                        refs: vec![r.clone()],
                    },
                    limit / 2,
                )
                .is_ok()
            {
                refs.push(r.clone());
            }
        }
    }
    let (context, cut) = if refs.is_empty() {
        (String::new(), false)
    } else {
        super::context::build(tx, &AiInput::Entities { refs }, limit / 2)?
    };
    let redacted = context.replace(key, "[REDACTED]");
    let cut = cut || redacted.chars().count() > limit / 2;
    let context = redacted.chars().take(limit / 2).collect::<String>();
    let mut budget = limit.saturating_sub(context.chars().count());
    let mut messages = vec![];
    let mut truncated = cut || history.messages.len() > 100;
    for m in history.messages.into_iter().rev().take(100) {
        if budget == 0 {
            truncated = true;
            break;
        }
        let content = m
            .content
            .replace(key, "[REDACTED]")
            .chars()
            .take(budget)
            .collect::<String>();
        let count = content.chars().count();
        truncated |= count < m.content.chars().count();
        budget = budget.saturating_sub(count);
        messages.push(ChatMessage {
            role: m.role,
            content,
        });
    }
    messages.reverse();
    if !context.is_empty() {
        messages.insert(
            0,
            ChatMessage {
                role: "system".into(),
                content: context,
            },
        );
    }
    Ok((messages, truncated))
}
