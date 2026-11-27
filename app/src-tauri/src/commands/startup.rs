//! Starting with Windows and game shortcut commands.

use tauri::{AppHandle, Runtime, State};

use crate::domain::shortcut::ShortcutAction;
use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use crate::services::startup::StartupState;
use crate::services::{shortcuts, startup};
use crate::storage::Database;

/// Whether Windows starts the launcher at sign-in.
#[tauri::command]
pub async fn get_autostart<R: Runtime>(app: AppHandle<R>) -> AppResult<bool> {
    startup::autostart_enabled(&app)
}

/// Turn starting with Windows on or off; returns the resulting state.
#[tauri::command]
pub async fn set_autostart<R: Runtime>(app: AppHandle<R>, enabled: bool) -> AppResult<bool> {
    startup::set_autostart(&app, enabled)
}

/// The game shortcut action the launcher was started with, handed out once.
#[tauri::command]
pub async fn take_shortcut_action(
    state: State<'_, StartupState>,
) -> AppResult<Option<ShortcutAction>> {
    state.take_pending()
}

/// Create the desktop shortcut of a game; returns the path of the shortcut file.
#[tauri::command]
pub async fn create_game_shortcut<R: Runtime>(
    app: AppHandle<R>,
    paths: State<'_, AppPaths>,
    database: State<'_, Database>,
    action: ShortcutAction,
) -> AppResult<String> {
    let game = database
        .get_game(&action.game_id)?
        .ok_or_else(|| AppError::NotFound {
            entity: "game",
            id: action.game_id.clone(),
        })?;
    let path = shortcuts::create(&app, &paths, &game, &action)?;
    Ok(path.to_string_lossy().into_owned())
}
