use crate::{
    db::Db,
    domain::provider::*,
    error::{AppError, AppResult},
    repo,
    services::secrets::SecretStore,
};
/// Accept only direct HTTP(S) endpoints without embedded credentials or query secrets.
pub fn validate_url(value: &str) -> AppResult<()> {
    let url = reqwest::Url::parse(value).map_err(|_| AppError::Invalid("Invalid URL".into()))?;
    if !["http", "https"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(AppError::Invalid(
            "URL must not contain credentials, query or fragment".into(),
        ));
    }
    Ok(())
}
/// Save configuration with compensating credential rollback on database failure.
pub fn save(db: &Db, secrets: &SecretStore, input: &ProviderInput) -> AppResult<ProviderView> {
    validate_url(&input.base_url)?;
    if input.name.trim().is_empty()
        || input.name.len() > 200
        || input.model.trim().is_empty()
        || input.model.len() > 200
        || !(0.0..=2.0).contains(&input.temperature)
        || input.max_tokens.is_some_and(|n| n == 0 || n > 1_000_000)
        || input
            .api_key
            .as_ref()
            .is_some_and(|k| k.len() > 16000 || k.contains(['\r', '\n']))
    {
        return Err(AppError::Invalid("Invalid provider fields".into()));
    }
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::now_v7().to_string());
    if input.id.is_some() {
        db.with_conn(|c| repo::providers::get(c, Some(&id)))?;
    }
    let old = secrets.get(&id)?;
    if let Some(key) = &input.api_key {
        if key.is_empty() {
            secrets.delete(&id)?;
        } else {
            secrets.set(&id, key)?;
        }
    }
    match db
        .with_tx(|tx| repo::providers::save(tx, &id, input, chrono::Utc::now().timestamp_millis()))
    {
        Ok(p) => view(p, secrets),
        Err(error) => {
            if input.api_key.is_some() {
                match old {
                    Some(k) => secrets.set(&id, &k)?,
                    None => secrets.delete(&id)?,
                }
            }
            Err(error)
        }
    }
}
/// Enrich configuration with a deliberately incomplete hint.
pub fn view(mut provider: ProviderView, secrets: &SecretStore) -> AppResult<ProviderView> {
    if let Some(key) = secrets.get(&provider.id)? {
        provider.has_key = true;
        provider.key_hint = Some(SecretStore::hint(&key));
    }
    Ok(provider)
}
