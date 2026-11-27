//! Startup sequence driven by the splash screen.

use std::collections::BTreeMap;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime, State};
use tokio::sync::OnceCell;

use crate::commands::sdk::{emit_capabilities_changed, progress_emitter};
use crate::error::AppResult;
use crate::events;
use crate::paths::AppPaths;
use crate::services::game_settings::{ConfigConflict, SettingsContext};
use crate::services::resources;
use crate::services::sdk::installer::SdkInstaller;
use crate::services::sdk::manager::SdkContext;
use crate::services::sdk::release::ReleaseClient;
use crate::services::settings_schema::SchemaRegistry;
use crate::services::system;
use crate::services::updater::{self, PendingUpdate, UpdateInfo};
use crate::storage::Database;
use crate::storage::app_config::AppConfigStore;

/// A splash screen step: a translation key, its parameters and the progress.
#[derive(Debug, Clone, Serialize)]
pub struct BootProgress {
    /// Translation key of the status message.
    pub key: &'static str,
    /// Interpolation values for the message.
    pub params: BTreeMap<&'static str, String>,
    /// Completion percentage (0–100).
    pub percent: u8,
}

/// Outcome of the startup sequence.
#[derive(Debug, Clone, Serialize)]
pub struct BootReport {
    /// Games whose launcher settings and game files disagree.
    pub conflicts: Vec<ConfigConflict>,
    /// A newer launcher version, when one was published.
    pub update: Option<UpdateInfo>,
}

/// Runs the startup sequence once per application run.
#[derive(Debug, Default)]
pub struct BootState(OnceCell<BootReport>);

fn emit_step<R: Runtime>(
    app: &AppHandle<R>,
    key: &'static str,
    percent: u8,
    params: &[(&'static str, String)],
) {
    let step = BootProgress {
        key,
        params: params.iter().cloned().collect(),
        percent,
    };
    if let Err(error) = app.emit(events::BOOT_PROGRESS, step) {
        tracing::debug!(%error, "Could not emit boot progress");
    }
}

/// Check the SDK and reconcile every game's settings, reporting progress.
///
/// Later calls return the first run's report without repeating the work.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn run_boot<R: Runtime>(
    app: AppHandle<R>,
    boot: State<'_, BootState>,
    paths: State<'_, AppPaths>,
    config: State<'_, AppConfigStore>,
    releases: State<'_, ReleaseClient>,
    installer: State<'_, SdkInstaller>,
    database: State<'_, Database>,
    schemas: State<'_, SchemaRegistry>,
    pending_update: State<'_, PendingUpdate>,
) -> AppResult<BootReport> {
    boot.0
        .get_or_try_init(|| async {
            let resources_dir = paths.resources_dir();
            if !resources::missing(&resources_dir).is_empty() {
                emit_step(&app, "boot.checkingResources", 2, &[]);
                let resources_app = app.clone();
                let downloaded = resources::ensure(releases.http(), &resources_dir, move |progress| {
                    let fraction = if progress.total > 0 {
                        progress.downloaded as f64 / progress.total as f64
                    } else {
                        progress.files_done as f64 / progress.files_total.max(1) as f64
                    };
                    let percent = (2.0 + 38.0 * fraction.clamp(0.0, 1.0)).round() as u8;
                    emit_step(
                        &resources_app,
                        "boot.downloadingResources",
                        percent,
                        &[
                            ("done", progress.files_done.to_string()),
                            ("total", progress.files_total.to_string()),
                        ],
                    );
                    if let Err(error) = resources_app.emit(events::RESOURCES_PROGRESS, progress) {
                        tracing::debug!(%error, "Could not emit resources progress");
                    }
                })
                .await;
                if let Err(error) = downloaded {
                    tracing::warn!(%error, "Resources check failed");
                }
            }

            emit_step(&app, "boot.checkingSdk", 42, &[]);
            let tools_dir = paths.tools_dir();
            let mut sdk_progress = progress_emitter(&app);
            let boot_app = app.clone();
            let sdk = SdkContext {
                tools_dir: &tools_dir,
                config: &config,
                releases: &releases,
                installer: &installer,
            };
            let sdk_result = sdk
                .check_on_boot(move |progress| {
                    emit_step(
                        &boot_app,
                        "boot.downloadingSdk",
                        48,
                        &[
                            ("version", progress.version.clone()),
                            ("percent", progress.percent.to_string()),
                        ],
                    );
                    sdk_progress(progress);
                })
                .await;
            if let Err(error) = sdk_result {
                tracing::warn!(%error, "SDK boot check failed");
            }
            emit_capabilities_changed(&app);

            emit_step(&app, "boot.checkingUpdate", 52, &[]);
            let update = updater::check(&app, &pending_update).await;

            let games = database.list_games()?;
            emit_step(&app, "boot.loadingGames", 55, &[("count", games.len().to_string())]);
            let dynamic = system::dynamic_defaults(&app);
            let settings = SettingsContext {
                database: &database,
                schemas: &schemas,
                dynamic: &dynamic,
            };
            let mut conflicts = Vec::new();
            let total = games.len().max(1);
            for (index, game) in games.iter().enumerate() {
                let percent = u8::try_from(58 + 30 * (index + 1) / total).unwrap_or(88);
                emit_step(&app, "boot.scanningGame", percent, &[("name", game.name.clone())]);
                match settings.reconcile(game) {
                    Ok(Some(conflict)) => conflicts.push(conflict),
                    Ok(None) => {}
                    Err(error) => {
                        tracing::error!(game_id = %game.id, %error, "Settings reconciliation failed");
                    }
                }
            }
            emit_step(&app, "boot.finishing", 92, &[]);
            Ok(BootReport { conflicts, update })
        })
        .await
        .cloned()
}
