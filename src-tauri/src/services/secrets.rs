use crate::error::{AppError, AppResult, ErrorCode};
use parking_lot::Mutex;

/// All persistent secrets use the OS credential backend, never SQLite or a file.
#[derive(Default)]
pub struct SecretStore {
    gate: Mutex<()>,
}
impl SecretStore {
    fn entry(id: &str) -> AppResult<keyring::Entry> {
        keyring::Entry::new("com.workbench.app", &format!("ai-provider:{id}"))
            .map_err(|_| AppError::coded(ErrorCode::SecretStore, "Credential store unavailable"))
    }
    /// Read a credential exclusively for constructing an outbound request.
    pub fn get(&self, id: &str) -> AppResult<Option<String>> {
        let _guard = self.gate.lock();
        match Self::entry(id)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(AppError::coded(
                ErrorCode::SecretStore,
                "Credential read failed",
            )),
        }
    }
    /// Persist to the native store. No secret-bearing errors escape this boundary.
    pub fn set(&self, id: &str, key: &str) -> AppResult<()> {
        let _guard = self.gate.lock();
        Self::entry(id)?
            .set_password(key)
            .map_err(|_| AppError::coded(ErrorCode::SecretStore, "Credential write failed"))
    }
    /// Remove the native credential; missing entries are already removed.
    pub fn delete(&self, id: &str) -> AppResult<()> {
        let _guard = self.gate.lock();
        match Self::entry(id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(AppError::coded(
                ErrorCode::SecretStore,
                "Credential deletion failed",
            )),
        }
    }
    /// Report presence without exposing the key.
    pub fn has(&self, id: &str) -> AppResult<bool> {
        Ok(self.get(id)?.is_some())
    }
    /// Short keys are fully masked so a hint can never reconstruct a full key.
    pub fn hint(key: &str) -> String {
        let chars = key.chars().collect::<Vec<_>>();
        if chars.len() <= 8 {
            return "••••".into();
        }
        format!(
            "{}…{}",
            chars[..3].iter().collect::<String>(),
            chars[chars.len() - 4..].iter().collect::<String>()
        )
    }
}
