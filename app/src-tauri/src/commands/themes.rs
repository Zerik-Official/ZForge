//! Theme commands: list, import, delete and read the active theme.

use std::fs;

use tauri::{AppHandle, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use crate::commands::assets::pick_file;
use crate::domain::theme::{ThemeManifest, ThemeSummary};
use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use crate::services::themes;
use crate::storage::app_config::AppConfigStore;

/// Installed themes, valid or not.
#[tauri::command]
pub async fn list_themes(paths: State<'_, AppPaths>) -> AppResult<Vec<ThemeSummary>> {
    themes::list(&paths.themes_dir())
}

/// The active theme with absolute file paths, or `None` for the built-in one.
#[tauri::command]
pub async fn get_active_theme(
    paths: State<'_, AppPaths>,
    config: State<'_, AppConfigStore>,
) -> AppResult<Option<ThemeManifest>> {
    Ok(themes::active(&paths.themes_dir(), &config.get()?.theme))
}

/// Let the user pick a theme zip and install it; `None` when cancelled.
#[tauri::command]
pub async fn import_theme<R: Runtime>(
    app: AppHandle<R>,
    paths: State<'_, AppPaths>,
) -> AppResult<Option<ThemeSummary>> {
    let Some(archive) = pick_file(&app, "Theme", &["zip"]).await? else {
        return Ok(None);
    };
    let themes_dir = paths.themes_dir();
    let imported =
        tauri::async_runtime::spawn_blocking(move || themes::import(&themes_dir, &archive))
            .await
            .map_err(|error| AppError::BackgroundTask(error.to_string()))?;
    if let Err(error) = &imported {
        tracing::warn!(%error, "Theme import failed");
    }
    imported.map(Some)
}

/// Delete an installed theme.
#[tauri::command]
pub async fn delete_theme(paths: State<'_, AppPaths>, id: String) -> AppResult<()> {
    themes::delete(&paths.themes_dir(), &id)
}

/// Open the themes folder in the file explorer, creating it if needed.
#[tauri::command]
pub async fn open_themes_folder<R: Runtime>(
    app: AppHandle<R>,
    paths: State<'_, AppPaths>,
) -> AppResult<()> {
    let folder = paths.themes_dir();
    fs::create_dir_all(&folder)?;
    app.opener()
        .open_path(folder.to_string_lossy(), None::<&str>)
        .map_err(|error| AppError::Opener(error.to_string()))
}
