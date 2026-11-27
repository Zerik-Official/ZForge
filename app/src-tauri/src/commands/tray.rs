//! Notification area icon commands.

use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::services::startup::StartupState;
use crate::services::tray::{self, TrayStrings};
use crate::storage::app_config::AppConfigStore;

/// Use these translated texts for the tray menu (sent on startup and when the language
/// changes). The icon is created the first time and shown while "close to tray" is on,
/// or when Windows started the launcher in the notification area.
#[tauri::command]
pub async fn set_tray_strings(
    app: AppHandle,
    store: State<'_, AppConfigStore>,
    startup: State<'_, StartupState>,
    strings: TrayStrings,
) -> AppResult<()> {
    let visible = store.get()?.close_to_tray || startup.in_tray();
    tray::update(&app, &strings, visible)
        .map_err(|error| AppError::BackgroundTask(error.to_string()))
}
