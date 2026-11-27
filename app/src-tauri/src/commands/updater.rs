//! Launcher update commands.

use tauri::{AppHandle, Runtime, State};

use crate::error::AppResult;
use crate::services::updater::{self, PendingUpdate};

/// Install the update found on boot and restart the launcher; progress arrives as
/// `update://progress`.
#[tauri::command]
pub async fn install_update<R: Runtime>(
    app: AppHandle<R>,
    pending: State<'_, PendingUpdate>,
) -> AppResult<()> {
    updater::install(&app, &pending).await
}
