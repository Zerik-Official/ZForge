//! SDK status reporting, installation and the startup health check.

use std::path::Path;

use serde::Serialize;

use crate::config::DISCORD_CLIENT_ID;
use crate::domain::app_config::AppConfigPatch;
use crate::error::AppResult;
use crate::services::sdk::installation::{self, Installation};
use crate::services::sdk::installer::{DownloadProgress, SdkInstaller};
use crate::services::sdk::release::ReleaseClient;
use crate::services::sdk::{ERROR_SDK_CORRUPTED, version};
use crate::storage::app_config::AppConfigStore;

/// Installation, configuration and update state of the SDK.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SdkStatus {
    /// An SDK folder exists.
    pub installed: bool,
    /// The SDK folder has every required binary.
    pub valid: bool,
    /// Installed version.
    pub version: Option<String>,
    /// Installation folder.
    pub path: Option<String>,
    /// Required binaries that are missing.
    pub missing_files: Vec<String>,
    /// No usable SDK is installed.
    pub needs_install: bool,
    /// An SDK folder exists but is broken.
    pub needs_repair: bool,
    /// A Discord application id was configured at build time.
    pub application_id_configured: bool,
    /// Discord Rich Presence is enabled.
    pub discord_enabled: bool,
    /// The SDK updates automatically.
    pub discord_auto_update: bool,
    /// Error code of the last failed SDK operation.
    pub sdk_last_error: Option<String>,
    /// The SDK was installed at least once.
    pub sdk_ever_installed: bool,
    /// Latest published version, when GitHub was reachable.
    pub latest_version: Option<String>,
    /// Download URL of the latest version.
    pub latest_url: Option<String>,
    /// A newer version than the installed one is available.
    pub update_available: bool,
    /// An installation is running.
    pub installing: bool,
}

/// Dependencies of every SDK operation.
#[derive(Debug, Clone, Copy)]
pub struct SdkContext<'a> {
    /// `tools` directory holding the installations.
    pub tools_dir: &'a Path,
    /// Launcher preferences.
    pub config: &'a AppConfigStore,
    /// GitHub release client.
    pub releases: &'a ReleaseClient,
    /// Installation lock.
    pub installer: &'a SdkInstaller,
}

impl SdkContext<'_> {
    /// Current status, including the latest release when GitHub is reachable.
    ///
    /// # Errors
    ///
    /// Fails when the tools directory or the preferences cannot be read.
    pub async fn status(&self) -> AppResult<SdkStatus> {
        let found = installation::find(self.tools_dir)?;
        let config = self.config.get()?;
        let latest = match self.releases.latest().await {
            Ok(release) => Some(release),
            Err(error) => {
                tracing::debug!(%error, "Latest SDK release unavailable");
                None
            }
        };
        let valid = found.as_ref().is_some_and(Installation::is_valid);
        let installed = found.is_some();
        let version = found.as_ref().map(|found| found.version.clone());
        let update_available = match (&latest, &version) {
            (Some(latest), Some(version)) => version::is_newer(&latest.version, version),
            (Some(_), None) => true,
            (None, _) => false,
        };
        Ok(SdkStatus {
            installed,
            valid,
            path: found
                .as_ref()
                .map(|found| found.path.to_string_lossy().into_owned()),
            missing_files: found
                .as_ref()
                .map(Installation::missing_files)
                .unwrap_or_default(),
            version,
            needs_install: !valid,
            needs_repair: installed && !valid,
            application_id_configured: !DISCORD_CLIENT_ID.trim().is_empty(),
            discord_enabled: config.discord_enabled,
            discord_auto_update: config.discord_auto_update,
            sdk_last_error: config.sdk_last_error,
            sdk_ever_installed: config.sdk_ever_installed,
            latest_version: latest.as_ref().map(|latest| latest.version.clone()),
            latest_url: latest.map(|latest| latest.browser_download_url),
            update_available,
            installing: self.installer.is_busy(),
        })
    }

    /// Install the latest release and record it in the preferences.
    ///
    /// # Errors
    ///
    /// Fails when another installation is running or the installation fails.
    pub async fn install(
        &self,
        on_progress: impl FnMut(DownloadProgress) + Send,
    ) -> AppResult<Installation> {
        let installed = self
            .installer
            .install_latest(self.releases, self.tools_dir, on_progress)
            .await?;
        self.config.update(AppConfigPatch {
            sdk_last_error: Some(None),
            sdk_ever_installed: Some(true),
            ..AppConfigPatch::default()
        })?;
        Ok(installed)
    }

    /// Install and store the error code on failure instead of returning it.
    async fn install_recording_errors(
        &self,
        on_progress: impl FnMut(DownloadProgress) + Send,
    ) -> AppResult<Option<Installation>> {
        match self.install(on_progress).await {
            Ok(installed) => Ok(Some(installed)),
            Err(error) => {
                self.config.update(AppConfigPatch {
                    sdk_last_error: Some(Some(error.code().to_owned())),
                    ..AppConfigPatch::default()
                })?;
                Ok(None)
            }
        }
    }

    /// Startup health check: flag a missing or corrupted SDK, repair it and
    /// apply updates when Rich Presence and auto-update are enabled.
    ///
    /// Returns the installation performed, if any.
    ///
    /// # Errors
    ///
    /// Fails when the tools directory or the preferences cannot be accessed.
    pub async fn check_on_boot(
        &self,
        on_progress: impl FnMut(DownloadProgress) + Send,
    ) -> AppResult<Option<Installation>> {
        let valid = installation::find_valid(self.tools_dir)?;
        let config = self.config.get()?;

        let Some(valid) = valid else {
            let last_error = if config.sdk_ever_installed {
                tracing::warn!("SDK was installed before but is now missing or corrupted");
                Some(ERROR_SDK_CORRUPTED.to_owned())
            } else {
                None
            };
            self.config.update(AppConfigPatch {
                sdk_last_error: Some(last_error),
                ..AppConfigPatch::default()
            })?;
            if !config.discord_enabled {
                tracing::info!("SDK repair skipped: Rich Presence is disabled");
                return Ok(None);
            }
            return self.install_recording_errors(on_progress).await;
        };

        if !config.sdk_ever_installed {
            self.config.update(AppConfigPatch {
                sdk_ever_installed: Some(true),
                ..AppConfigPatch::default()
            })?;
        }
        if !config.discord_enabled || !config.discord_auto_update {
            return Ok(None);
        }
        let latest = match self.releases.latest().await {
            Ok(latest) => latest,
            Err(error) => {
                tracing::info!(%error, "SDK update check skipped");
                return Ok(None);
            }
        };
        if !version::is_newer(&latest.version, &valid.version) {
            return Ok(None);
        }
        tracing::info!(from = %valid.version, to = %latest.version, "Updating SDK");
        self.install_recording_errors(on_progress).await
    }
}
