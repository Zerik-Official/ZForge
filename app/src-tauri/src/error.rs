//! Application-wide error type shared by every backend layer.

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

use crate::domain::theme::ThemeError;

/// Convenience alias for results that fail with [`AppError`].
pub type AppResult<T> = Result<T, AppError>;

/// Every failure the backend can report.
///
/// Messages are English and meant for logs; the frontend translates the
/// stable [`AppError::code`] instead of showing the message.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// A SQLite operation failed.
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    /// A filesystem operation failed.
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON (de)serialization failed.
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    /// A lock guarding shared state was poisoned by a panicking thread.
    #[error("lock poisoned: {0}")]
    LockPoisoned(&'static str),

    /// A requested entity does not exist.
    #[error("{entity} not found: {id}")]
    NotFound {
        /// Kind of entity that was looked up (for example, `game`).
        entity: &'static str,
        /// Identifier that was not found.
        id: String,
    },

    /// The platform could not resolve a required directory.
    #[error("path resolution failed: {0}")]
    PathResolution(String),

    /// A background task panicked or was cancelled.
    #[error("background task failed: {0}")]
    BackgroundTask(String),

    /// An HTTP request failed.
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),

    /// A zip archive could not be read or extracted.
    #[error("archive error: {0}")]
    Archive(#[from] zip::result::ZipError),

    /// The latest SDK release has no downloadable package.
    #[error("no downloadable SDK release was found")]
    SdkReleaseUnavailable,

    /// An SDK download is already running.
    #[error("an SDK installation is already in progress")]
    SdkInstallInProgress,

    /// The installed SDK lacks required files.
    #[error("SDK installation is incomplete; missing: {}", missing.join(", "))]
    SdkIncomplete {
        /// Missing paths relative to the installation folder.
        missing: Vec<String>,
    },

    /// A URL was rejected before opening it.
    #[error("invalid url: {0}")]
    InvalidUrl(String),

    /// The system could not open a URL or file.
    #[error("could not open: {0}")]
    Opener(String),

    /// The game executable does not exist.
    #[error("game executable not found: {0}")]
    GameExecutableMissing(String),

    /// The SDK pipes are not available (game not running or SDK not injected).
    #[error("the SDK is not reachable")]
    SdkUnavailable,

    /// The SDK answered a JSON-RPC request with an error.
    #[error("SDK call {method} failed: {message}")]
    SdkRpc {
        /// JSON-RPC method that failed.
        method: String,
        /// Error message returned by the SDK.
        message: String,
    },

    /// `WowInjector.exe` could not start the game.
    #[error("SDK injection failed: {0}")]
    SdkInjectionFailed(String),

    /// The SDK rejected the session token.
    #[error("the SDK rejected the session token")]
    SdkUnauthorized,

    /// A game session is already running.
    #[error("a game session is already running")]
    GameAlreadyRunning,

    /// The Windows Credential Manager failed.
    #[error("credential manager error: {0}")]
    Credential(String),

    /// The account has no stored password.
    #[error("no password is stored for account {0}")]
    PasswordMissing(String),

    /// A theme folder or archive cannot be used.
    #[error("invalid theme: {0}")]
    ThemeInvalid(ThemeError),

    /// An account needs a server and a login name.
    #[error("an account needs a server and a login name")]
    AccountInvalid,

    /// The server already has an account with that login name.
    #[error("an account with that login name already exists on this server")]
    AccountExists,

    /// Logging in with an account or a hidden window needs an installed SDK.
    #[error("launching with an account or hidden needs the SDK")]
    AccountRequiresSdk,
}

impl AppError {
    /// Stable machine-readable code the frontend maps to a translated message.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Database(_) => "database",
            Self::Io(_) => "io",
            Self::Json(_) => "json",
            Self::LockPoisoned(_) | Self::BackgroundTask(_) => "internal",
            Self::NotFound { .. } => "not_found",
            Self::PathResolution(_) => "path_resolution",
            Self::Network(_) => "network",
            Self::Archive(_) => "archive",
            Self::SdkReleaseUnavailable => "sdk_release_unavailable",
            Self::SdkInstallInProgress => "sdk_install_in_progress",
            Self::SdkIncomplete { .. } => "sdk_incomplete",
            Self::InvalidUrl(_) => "invalid_url",
            Self::Opener(_) => "opener",
            Self::GameExecutableMissing(_) => "game_executable_missing",
            Self::SdkUnavailable => "sdk_unavailable",
            Self::SdkRpc { .. } => "sdk_rpc",
            Self::SdkInjectionFailed(_) => "sdk_injection_failed",
            Self::GameAlreadyRunning => "game_already_running",
            Self::SdkUnauthorized => "sdk_unauthorized",
            Self::Credential(_) => "credential",
            Self::PasswordMissing(_) => "password_missing",
            Self::AccountRequiresSdk => "account_requires_sdk",
            Self::AccountExists => "account_exists",
            Self::AccountInvalid => "account_invalid",
            Self::ThemeInvalid(_) => "theme_invalid",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("AppError", 3)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        match self {
            Self::ThemeInvalid(details) => state.serialize_field("details", details)?,
            _ => state.serialize_field("details", &Option::<()>::None)?,
        }
        state.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_and_message() -> Result<(), serde_json::Error> {
        let error = AppError::NotFound {
            entity: "game",
            id: "abc".to_owned(),
        };
        let json = serde_json::to_value(&error)?;
        assert_eq!(json["code"], "not_found");
        assert_eq!(json["message"], "game not found: abc");
        Ok(())
    }
}
