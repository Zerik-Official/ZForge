//! ZForge desktop host built on Tauri.

pub mod commands;
pub mod config;
pub mod domain;
pub mod error;
pub mod events;
pub mod paths;
pub mod services;
pub mod storage;

use tauri::Manager;

use crate::commands::boot::BootState;
use crate::paths::AppPaths;
use crate::services::sdk::installer::SdkInstaller;
use crate::services::sdk::release::ReleaseClient;
use crate::services::settings_schema::SchemaRegistry;
use crate::storage::Database;
use crate::storage::app_config::AppConfigStore;

/// Build and run the Tauri application until the main window closes.
///
/// # Errors
///
/// Returns an error when a plugin fails to initialize or the runtime cannot start.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> tauri::Result<()> {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_config::get_app_config,
            commands::app_config::save_app_config,
            commands::assets::list_assets,
            commands::assets::select_exe,
            commands::assets::select_custom_asset,
            commands::boot::run_boot,
            commands::games::launch_game,
            commands::games::list_games,
            commands::games::add_game,
            commands::games::update_game,
            commands::games::remove_game,
            commands::games::reorder_games,
            commands::sdk::get_sdk_status,
            commands::sdk::install_sdk,
            commands::sdk::check_sdk_update,
            commands::sdk::get_sdk_license,
            commands::sdk::open_external_url,
            commands::servers::list_servers,
            commands::servers::save_custom_server,
            commands::servers::add_custom_realm,
            commands::settings::get_settings_schema,
            commands::settings::list_settings_versions,
            commands::settings::get_game_settings,
            commands::settings::save_game_settings,
            commands::settings::scan_game_config,
            commands::settings::apply_game_settings,
            commands::settings::pull_game_settings,
            commands::system::get_display_resolution,
            commands::system::list_audio_devices,
        ])
        .setup(|app| {
            let paths = AppPaths::resolve(app.handle())?;
            let database = Database::open(&paths.database_file())?;
            let schemas = SchemaRegistry::load()?;
            tracing::info!(data_dir = %paths.root().display(), "ZForge host started");
            app.manage(AppConfigStore::new(paths.config_file()));
            app.manage(paths);
            app.manage(database);
            app.manage(schemas);
            app.manage(ReleaseClient::new()?);
            app.manage(SdkInstaller::default());
            app.manage(BootState::default());
            Ok(())
        })
        .run(tauri::generate_context!())
}
