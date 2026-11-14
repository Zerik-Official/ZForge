//! WoWControlSDK management commands.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use crate::error::{AppError, AppResult};
use crate::events;
use crate::paths::AppPaths;
use crate::services::sdk::installer::{DownloadProgress, SdkInstaller};
use crate::services::sdk::manager::{SdkContext, SdkStatus};
use crate::services::sdk::release::{ReleaseClient, SdkRelease};
use crate::storage::app_config::AppConfigStore;

/// Result of a successful SDK installation.
#[derive(Debug, Clone, Serialize)]
pub struct InstalledSdk {
    /// Installed version.
    pub version: String,
    /// Installation folder.
    pub path: String,
}

/// Forward download progress to the frontend.
pub fn progress_emitter<R: Runtime>(app: &AppHandle<R>) -> impl FnMut(DownloadProgress) + Send {
    let app = app.clone();
    move |progress| {
        if let Err(error) = app.emit(events::SDK_DOWNLOAD_PROGRESS, progress) {
            tracing::debug!(%error, "Could not emit SDK download progress");
        }
    }
}

/// Installation, configuration and update state of the SDK.
#[tauri::command]
pub async fn get_sdk_status(
    paths: State<'_, AppPaths>,
    config: State<'_, AppConfigStore>,
    releases: State<'_, ReleaseClient>,
    installer: State<'_, SdkInstaller>,
) -> AppResult<SdkStatus> {
    let tools_dir = paths.tools_dir();
    SdkContext {
        tools_dir: &tools_dir,
        config: &config,
        releases: &releases,
        installer: &installer,
    }
    .status()
    .await
}

/// Download and install the latest SDK, emitting progress events.
#[tauri::command]
pub async fn install_sdk<R: Runtime>(
    app: AppHandle<R>,
    paths: State<'_, AppPaths>,
    config: State<'_, AppConfigStore>,
    releases: State<'_, ReleaseClient>,
    installer: State<'_, SdkInstaller>,
) -> AppResult<InstalledSdk> {
    let tools_dir = paths.tools_dir();
    let installed = SdkContext {
        tools_dir: &tools_dir,
        config: &config,
        releases: &releases,
        installer: &installer,
    }
    .install(progress_emitter(&app))
    .await?;
    Ok(InstalledSdk {
        version: installed.version,
        path: installed.path.to_string_lossy().into_owned(),
    })
}

/// The latest published release, or `None` when GitHub is unreachable.
#[tauri::command]
pub async fn check_sdk_update(releases: State<'_, ReleaseClient>) -> AppResult<Option<SdkRelease>> {
    match releases.latest().await {
        Ok(release) => Ok(Some(release)),
        Err(error) => {
            tracing::warn!(%error, "SDK update check failed");
            Ok(None)
        }
    }
}

/// The SDK license text.
#[tauri::command]
pub async fn get_sdk_license(releases: State<'_, ReleaseClient>) -> AppResult<String> {
    releases.license().await
}

/// Open an `http(s)` URL in the system browser.
#[tauri::command]
pub async fn open_external_url<R: Runtime>(app: AppHandle<R>, url: String) -> AppResult<()> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(|_| AppError::InvalidUrl(url.clone()))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AppError::InvalidUrl(url));
    }
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|error| AppError::Opener(error.to_string()))
}
