//! Launcher updates published on GitHub Releases, checked during the boot.
//!
//! The updater reads `latest.json` from the latest release, verifies the installer with the
//! public key in `tauri.conf.json` and installs it in passive mode. A failed check never
//! blocks the boot.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::error::{AppError, AppResult};
use crate::events;

/// A newer launcher version found on boot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// Version available.
    pub version: String,
    /// Version running now.
    pub current_version: String,
    /// Release notes, in Markdown.
    pub notes: Option<String>,
    /// Publication date, as written in `latest.json`.
    pub date: Option<String>,
}

/// Progress of the update download.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    /// Bytes downloaded so far.
    pub downloaded: u64,
    /// Size of the installer, when the server reports it.
    pub total: Option<u64>,
}

/// The update found on boot, kept until the user installs it.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

impl std::fmt::Debug for PendingUpdate {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PendingUpdate")
            .finish_non_exhaustive()
    }
}

/// Look for a newer launcher version and keep it for [`install`]. Errors are logged.
pub async fn check<R: Runtime>(app: &AppHandle<R>, pending: &PendingUpdate) -> Option<UpdateInfo> {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(error) => {
            tracing::debug!(%error, "Launcher updater unavailable");
            return None;
        }
    };
    let update = match updater.check().await {
        Ok(update) => update?,
        Err(error) => {
            tracing::info!(%error, "Launcher update check skipped");
            return None;
        }
    };
    let info = UpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone(),
        date: update.date.map(|date| date.to_string()),
    };
    tracing::info!(from = %info.current_version, to = %info.version, "Launcher update available");
    match pending.0.lock() {
        Ok(mut slot) => *slot = Some(update),
        Err(_) => tracing::warn!("Could not keep the launcher update"),
    }
    Some(info)
}

/// Download and install the update found on boot, reporting the progress, then restart.
///
/// # Errors
///
/// Fails when no update is pending or the download, the signature or the installer fail.
pub async fn install<R: Runtime>(app: &AppHandle<R>, pending: &PendingUpdate) -> AppResult<()> {
    let update = pending
        .0
        .lock()
        .map_err(|_| AppError::LockPoisoned("launcher update"))?
        .take()
        .ok_or_else(|| AppError::NotFound {
            entity: "update",
            id: String::new(),
        })?;
    let mut downloaded: u64 = 0;
    update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let progress = UpdateProgress { downloaded, total };
                if let Err(error) = app.emit(events::UPDATE_PROGRESS, progress) {
                    tracing::debug!(%error, "Could not emit update progress");
                }
            },
            || tracing::info!("Launcher update downloaded"),
        )
        .await
        .map_err(|error| AppError::UpdateFailed(error.to_string()))?;
    app.restart()
}
