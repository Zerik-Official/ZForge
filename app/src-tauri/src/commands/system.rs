//! Machine information commands.

use tauri::{AppHandle, Runtime};

use crate::error::{AppError, AppResult};
use crate::services::system::{self, AudioDevice, Resolution};

/// Native resolution of the primary monitor.
#[tauri::command]
pub async fn get_display_resolution<R: Runtime>(app: AppHandle<R>) -> AppResult<Resolution> {
    Ok(system::primary_resolution(&app))
}

/// Audio output devices for the sound settings.
#[tauri::command]
pub async fn list_audio_devices() -> AppResult<Vec<AudioDevice>> {
    tauri::async_runtime::spawn_blocking(system::audio_output_devices)
        .await
        .map_err(|error| AppError::BackgroundTask(error.to_string()))
}
