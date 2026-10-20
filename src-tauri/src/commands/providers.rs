use crate::{
    domain::{common::IdInput, provider::*},
    error::{AppError, AppResult, ErrorCode},
    events, repo, services,
    state::AppState,
};
/// List only public provider metadata and non-reconstructable credential hints.
#[tauri::command(async)]
pub fn provider_list(state: tauri::State<'_, AppState>) -> AppResult<Vec<ProviderView>> {
    state
        .db
        .with_conn(repo::providers::list)?
        .into_iter()
        .map(|p| services::providers::view(p, &state.secrets))
        .collect()
}
/// Never serialize or log the secret-bearing input DTO.
#[tauri::command(async)]
pub fn provider_save(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: ProviderInput,
) -> AppResult<ProviderView> {
    let _guard = state.credential_mutations.lock();
    let result = services::providers::save(&state.db, &state.secrets, &input)?;
    events::emit_data_changed(&app, "provider", "update")?;
    Ok(result)
}
/// Remove a credential together with its configuration, compensating on failure.
#[tauri::command(async)]
pub fn provider_delete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<()> {
    let _guard = state.credential_mutations.lock();
    let old = state.secrets.get(&input.id)?;
    state.secrets.delete(&input.id)?;
    if let Err(e) = state
        .db
        .with_tx(|tx| repo::providers::delete(tx, &input.id))
    {
        if let Some(key) = old {
            state.secrets.set(&input.id, &key)?;
        }
        return Err(e);
    }
    events::emit_data_changed(&app, "provider", "delete")
}
/// Change the default without changing any running conversation's temporary choice.
#[tauri::command(async)]
pub fn provider_set_default(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: IdInput,
) -> AppResult<()> {
    state
        .db
        .with_tx(|tx| repo::providers::set_default(tx, &input.id))?;
    events::emit_data_changed(&app, "provider", "update")
}
fn key(state: &AppState, input: &ProviderTestInput) -> AppResult<String> {
    services::providers::validate_url(&input.base_url)?;
    let key = match &input.api_key {
        Some(k) => Some(k.clone()),
        None => {
            if let Some(id) = &input.provider_id {
                state.secrets.get(id)?
            } else {
                None
            }
        }
    };
    key.filter(|k| !k.is_empty())
        .ok_or_else(|| AppError::coded(ErrorCode::AiNoKey, "Missing API credential"))
}
/// Test an unsaved form or an already saved native credential.
#[tauri::command]
pub async fn provider_test(
    state: tauri::State<'_, AppState>,
    input: ProviderTestInput,
) -> AppResult<ConnectionTest> {
    let key = key(&state, &input)?;
    let started = std::time::Instant::now();
    let provider = ProviderView {
        id: String::new(),
        name: String::new(),
        base_url: input.base_url,
        model: input.model,
        temperature: 0.0,
        max_tokens: Some(16),
        is_default: false,
        has_key: true,
        key_hint: None,
    };
    let client = state.ai.client();
    let result = tokio::time::timeout(state.ai.idle_timeout, async {
        let response = services::ai::client::chat(
            &client,
            &provider,
            &key,
            &[crate::domain::ai::ChatMessage {
                role: "user".into(),
                content: "ping".into(),
            }],
            false,
        )
        .await?;
        let bytes = services::ai::client::bytes(response).await?;
        let value: serde_json::Value = serde_json::from_slice(&bytes)
            .map_err(|_| AppError::coded(ErrorCode::AiBadResponse, "Invalid chat response"))?;
        if value.pointer("/choices/0/message").is_none() {
            return Err(AppError::coded(
                ErrorCode::AiBadResponse,
                "Missing chat response",
            ));
        }
        Ok::<(), AppError>(())
    })
    .await
    .unwrap_or_else(|_| {
        Err(AppError::coded(
            ErrorCode::Timeout,
            "Connection test timed out",
        ))
    });
    Ok(ConnectionTest {
        ok: result.is_ok(),
        latency_ms: started.elapsed().as_millis().min(u128::from(u32::MAX)) as u32,
        error: result.err().map(|e| e.payload()),
    })
}
/// Fetch models without returning response bodies or credentials.
#[tauri::command]
pub async fn provider_fetch_models(
    state: tauri::State<'_, AppState>,
    input: ProviderTestInput,
) -> AppResult<Vec<String>> {
    let key = key(&state, &input)?;
    tokio::time::timeout(
        state.ai.idle_timeout,
        services::ai::client::models(&state.ai.client(), &input, &key),
    )
    .await
    .map_err(|_| AppError::coded(ErrorCode::Timeout, "Model list timed out"))?
}
