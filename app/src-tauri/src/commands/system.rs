//! Machine information commands.

use tauri::{AppHandle, Runtime};

use crate::config::{BUILD_COMMIT, BUILD_COMMIT_DATE, BUILD_DIRTY, REPOSITORY_URL};
use crate::domain::build_info::BuildInfo;
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

/// Version and commit of the running launcher.
#[tauri::command]
pub async fn get_build_info<R: Runtime>(app: AppHandle<R>) -> AppResult<BuildInfo> {
    Ok(BuildInfo::new(
        app.package_info().version.to_string(),
        BUILD_COMMIT,
        BUILD_COMMIT_DATE,
        BUILD_DIRTY,
        REPOSITORY_URL,
    ))
}
