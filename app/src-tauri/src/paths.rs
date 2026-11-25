//! Filesystem locations for persisted user data.
//!
//! Everything lives under the Tauri application data directory:
//!
//! ```text
//! <app_data_dir>/
//!     config.json          global launcher preferences
//!     zforge.db            games, per-game settings and custom servers
//!     assets/custom/<kind> user-provided icons, logos and scenes
//!     tools/               external tools such as WoWControlSDK
//!     themes/<id>/         installed themes
//! ```

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use crate::error::{AppError, AppResult};

/// Resolved data directories for the running application.
#[derive(Debug, Clone)]
pub struct AppPaths {
    root: PathBuf,
}

impl AppPaths {
    /// Build paths rooted at an explicit directory.
    pub fn from_root(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// Resolve paths from the Tauri application data directory.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::PathResolution`] when the platform directory is unavailable.
    pub fn resolve<R: Runtime>(app: &AppHandle<R>) -> AppResult<Self> {
        let root = app
            .path()
            .app_data_dir()
            .map_err(|error| AppError::PathResolution(error.to_string()))?;
        Ok(Self::from_root(root))
    }

    /// Root application data directory.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Global launcher preferences file.
    pub fn config_file(&self) -> PathBuf {
        self.root.join("config.json")
    }

    /// SQLite database file.
    pub fn database_file(&self) -> PathBuf {
        self.root.join("zforge.db")
    }

    /// Directory holding user-provided assets of a given kind.
    pub fn custom_assets_dir(&self, kind: &str) -> PathBuf {
        self.root.join("assets").join("custom").join(kind)
    }

    /// Directory holding external tools such as WoWControlSDK.
    pub fn tools_dir(&self) -> PathBuf {
        self.root.join("tools")
    }

    /// Directory holding installed themes.
    pub fn themes_dir(&self) -> PathBuf {
        self.root.join("themes")
    }

    /// Directory holding the media downloaded from the assets CDN.
    pub fn resources_dir(&self) -> PathBuf {
        self.root.join("resources")
    }
}
