//! Global launcher preferences commands.

use tauri::{AppHandle, State};

use crate::domain::app_config::{AppConfig, AppConfigPatch};
use crate::error::AppResult;
use crate::services::notifications::NotificationService;
use crate::services::presence::PresenceService;
use crate::services::tray;
use crate::storage::app_config::AppConfigStore;

/// Current launcher preferences.
#[tauri::command]
pub async fn get_app_config(store: State<'_, AppConfigStore>) -> AppResult<AppConfig> {
    store.get()
}

/// Apply a partial update to the launcher preferences.
#[tauri::command]
pub async fn save_app_config(
    app: AppHandle,
    store: State<'_, AppConfigStore>,
    presence: State<'_, PresenceService>,
    notifications: State<'_, NotificationService>,
    patch: AppConfigPatch,
) -> AppResult<AppConfig> {
    let config = store.update(patch)?;
    presence.set_enabled(config.discord_enabled);
    presence.set_options(config.presence);
    tray::set_visible(&app, config.close_to_tray);
    notifications.set_settings(config.notifications);
    Ok(config)
}
