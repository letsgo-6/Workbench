use serde::{Serialize, Serializer};
use ts_rs::TS;

/// Stable frontend error codes; diagnostic details never contain request bodies.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[ts(export)]
pub enum ErrorCode {
    NotFound,
    Validation,
    Conflict,
    Db,
    Io,
    Internal,
    Network,
    Timeout,
    ImportInvalid,
    SecretStore,
    ShortcutConflict,
    ShortcutInvalid,
    AiNoProvider,
    AiNoKey,
    AiAuth,
    AiEndpoint,
    AiRateLimit,
    AiProvider,
    AiBadResponse,
}

/// Serializable IPC failure.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppErrorPayload {
    pub code: ErrorCode,
    pub message: String,
    pub detail: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{1}")]
    Coded(ErrorCode, String),
    #[error("{0}")]
    Invalid(String),
    #[error("Record not found")]
    NotFound,
    #[error(transparent)]
    Db(#[from] rusqlite::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Network(String),
}
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let code = match self {
            Self::Coded(code, _) => code.clone(),
            Self::Invalid(_) => ErrorCode::Validation,
            Self::NotFound => ErrorCode::NotFound,
            Self::Db(error)
                if error.sqlite_error_code() == Some(rusqlite::ErrorCode::ConstraintViolation) =>
            {
                ErrorCode::Conflict
            }
            Self::Db(_) => ErrorCode::Db,
            Self::Io(_) => ErrorCode::Io,
            Self::Json(_) => ErrorCode::Internal,
            Self::Network(_) => ErrorCode::Network,
        };
        AppErrorPayload {
            code,
            message: self.to_string(),
            detail: None,
        }
        .serialize(serializer)
    }
}
pub type AppResult<T> = Result<T, AppError>;
impl AppError {
    /// Construct a failure containing only a safe diagnostic.
    pub fn coded(code: ErrorCode, message: &str) -> Self {
        Self::Coded(code, message.into())
    }
    /// Convert to the same safe payload used by IPC and streaming.
    pub fn payload(&self) -> AppErrorPayload {
        let value = serde_json::to_value(self).unwrap_or_default();
        AppErrorPayload {
            code: self.code(),
            message: value
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Internal failure")
                .into(),
            detail: None,
        }
    }
    /// Return the stable code without serializing sensitive inputs.
    pub fn code(&self) -> ErrorCode {
        match self {
            Self::Coded(code, _) => code.clone(),
            Self::Invalid(_) => ErrorCode::Validation,
            Self::NotFound => ErrorCode::NotFound,
            Self::Db(_) => ErrorCode::Db,
            Self::Io(_) => ErrorCode::Io,
            Self::Json(_) => ErrorCode::Internal,
            Self::Network(_) => ErrorCode::Network,
        }
    }
}
