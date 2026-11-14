//! Startup sequence driven by the splash screen.

use std::collections::BTreeMap;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime, State};
use tokio::sync::OnceCell;

use crate::commands::sdk::progress_emitter;
use crate::error::AppResult;
use crate::events;
use crate::paths::AppPaths;
use crate::services::game_settings::{ConfigConflict, SettingsContext};
use crate::services::sdk::installer::SdkInstaller;
use crate::services::sdk::manager::SdkContext;
use crate::services::sdk::release::ReleaseClient;
use crate::services::settings_schema::SchemaRegistry;
use crate::services::system;
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
) -> AppResult<BootReport> {
    boot.0
        .get_or_try_init(|| async {
            emit_step(&app, "boot.checkingSdk", 12, &[]);
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
                        55,
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

            let games = database.list_games()?;
            emit_step(&app, "boot.loadingGames", 22, &[("count", games.len().to_string())]);
            let dynamic = system::dynamic_defaults(&app);
            let settings = SettingsContext {
                database: &database,
                schemas: &schemas,
                dynamic: &dynamic,
            };
            let mut conflicts = Vec::new();
            let total = games.len().max(1);
            for (index, game) in games.iter().enumerate() {
                let percent = u8::try_from(30 + 55 * (index + 1) / total).unwrap_or(85);
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
            Ok(BootReport { conflicts })
        })
        .await
        .cloned()
}
