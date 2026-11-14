//! Global launcher preferences stored as `config.json`.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::domain::app_config::{AppConfig, AppConfigPatch};
use crate::error::{AppError, AppResult};

/// Serialized access to `config.json` shared through Tauri state.
#[derive(Debug)]
pub struct AppConfigStore {
    path: PathBuf,
    lock: Mutex<()>,
}

impl AppConfigStore {
    /// Store backed by the given file.
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    /// Current preferences.
    ///
    /// # Errors
    ///
    /// Fails when the file exists but cannot be read.
    pub fn get(&self) -> AppResult<AppConfig> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| AppError::LockPoisoned("app config"))?;
        load(&self.path)
    }

    /// Apply a partial update and persist it.
    ///
    /// # Errors
    ///
    /// Fails when the file cannot be read or written.
    pub fn update(&self, patch: AppConfigPatch) -> AppResult<AppConfig> {
        let _guard = self
            .lock
            .lock()
            .map_err(|_| AppError::LockPoisoned("app config"))?;
        let mut config = load(&self.path)?;
        config.apply(patch);
        save(&self.path, &config)?;
        Ok(config)
    }
}

/// Load the preferences, falling back to defaults when the file is missing or corrupt.
///
/// # Errors
///
/// Fails only when the file exists but cannot be read.
pub fn load(path: &Path) -> AppResult<AppConfig> {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            tracing::info!(path = %path.display(), "Config file not found; using defaults");
            return Ok(AppConfig::default());
        }
        Err(error) => return Err(error.into()),
    };
    match serde_json::from_str(&contents) {
        Ok(config) => {
            tracing::debug!(path = %path.display(), "Config loaded");
            Ok(config)
        }
        Err(error) => {
            tracing::warn!(%error, path = %path.display(), "Invalid config file; using defaults");
            Ok(AppConfig::default())
        }
    }
}

/// Persist the preferences atomically (write to a temporary file, then rename).
///
/// # Errors
///
/// Fails when the directory cannot be created or the file cannot be written.
pub fn save(path: &Path, config: &AppConfig) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(config)?)?;
    fs::rename(&temporary, path)?;
    tracing::debug!(path = %path.display(), "Config saved");
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::domain::app_config::AppLanguage;

    use super::*;

    #[test]
    fn round_trips_and_defaults() -> AppResult<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("nested").join("config.json");
        assert_eq!(load(&path)?, AppConfig::default());

        let config = AppConfig {
            language: Some(AppLanguage::En),
            discord_enabled: true,
            ..AppConfig::default()
        };
        save(&path, &config)?;
        assert_eq!(load(&path)?, config);
        Ok(())
    }

    #[test]
    fn tolerates_unknown_and_invalid_values() -> AppResult<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("config.json");
        fs::write(
            &path,
            r#"{"language":"fr","discord_enabled":true,"legacy":1}"#,
        )?;
        let config = load(&path)?;
        assert_eq!(config.language, None);
        assert!(config.discord_enabled);

        fs::write(&path, "not json")?;
        assert_eq!(load(&path)?, AppConfig::default());
        Ok(())
    }

    #[test]
    fn patches_distinguish_missing_from_null() -> AppResult<()> {
        let directory = tempfile::tempdir()?;
        let store = AppConfigStore::new(directory.path().join("config.json"));
        store.update(serde_json::from_str(
            r#"{"last_active_game":"g1","language":"es","sdk_last_error":"  "}"#,
        )?)?;
        let config = store.update(serde_json::from_str(
            r#"{"language":"fr","theme":"light"}"#,
        )?)?;
        assert_eq!(config.last_active_game.as_deref(), Some("g1"));
        assert_eq!(config.language, Some(AppLanguage::Es));
        assert_eq!(config.sdk_last_error, None);
        assert_eq!(config.theme, "light");

        let cleared = store.update(serde_json::from_str(r#"{"last_active_game":null}"#)?)?;
        assert_eq!(cleared.last_active_game, None);
        assert_eq!(store.get()?, cleared);
        Ok(())
    }
}
