//! ZForge desktop host built on Tauri.

pub mod commands;
pub mod config;
pub mod domain;
pub mod error;
pub mod events;
pub mod logging;
pub mod paths;
pub mod services;
pub mod storage;

use tauri::{AppHandle, Emitter, Manager, Runtime, WindowEvent};
use tokio::sync::broadcast::error::RecvError;

use crate::commands::boot::BootState;
use crate::config::DISCORD_CLIENT_ID;
use crate::paths::AppPaths;
use crate::services::accounts;
use crate::services::notifications::NotificationService;
use crate::services::presence::PresenceService;
use crate::services::presence::assets::PresenceAssets;
use crate::services::sdk::installer::SdkInstaller;
use crate::services::sdk::release::ReleaseClient;
use crate::services::session::GameSession;
use crate::services::settings_schema::SchemaRegistry;
use crate::services::tray;
use crate::storage::Database;
use crate::storage::app_config::AppConfigStore;

/// Emit every session change to the frontend.
fn forward_session_changes<R: Runtime>(app: &AppHandle<R>, session: &GameSession) {
    let app = app.clone();
    let mut changes = session.subscribe();
    tauri::async_runtime::spawn(async move {
        while changes.changed().await.is_ok() {
            let snapshot = changes.borrow_and_update().clone();
            if let Err(error) = app.emit(events::SESSION_CHANGED, snapshot) {
                tracing::debug!(%error, "Could not emit session change");
            }
        }
    });
}

/// Move the window aside when a game starts and bring it back when it closes,
/// following the launcher preferences.
fn follow_games_with_window<R: Runtime>(app: &AppHandle<R>, session: &GameSession) {
    let app = app.clone();
    let mut changes = session.subscribe();
    tauri::async_runtime::spawn(async move {
        let mut was_active = changes.borrow().is_active();
        let mut moved = false;
        while changes.changed().await.is_ok() {
            let active = changes.borrow_and_update().is_active();
            if active == was_active {
                continue;
            }
            was_active = active;
            let Some(config) = app
                .try_state::<AppConfigStore>()
                .and_then(|store| store.get().ok())
            else {
                continue;
            };
            if active {
                moved = tray::on_game_started(&app, config.launch_behavior);
            } else if std::mem::take(&mut moved) && config.restore_after_game {
                tray::restore_after_game(&app, config.close_to_tray);
            }
        }
    });
}

/// Save the characters read after each automatic login.
fn store_seen_characters<R: Runtime>(app: &AppHandle<R>, session: &GameSession) {
    let app = app.clone();
    let mut seen = session.subscribe_characters();
    tauri::async_runtime::spawn(async move {
        loop {
            let characters = match seen.recv().await {
                Ok(characters) => characters,
                Err(RecvError::Lagged(skipped)) => {
                    tracing::debug!(skipped, "Skipped character lists");
                    continue;
                }
                Err(RecvError::Closed) => break,
            };
            let database = app.state::<Database>();
            match accounts::store_characters(&database, &characters) {
                Ok(()) => {
                    if let Err(error) = app.emit(events::ACCOUNTS_CHANGED, ()) {
                        tracing::debug!(%error, "Could not emit account change");
                    }
                }
                Err(error) => tracing::warn!(%error, "Could not save the characters"),
            }
        }
    });
}

/// Whether closing the main window should hide it in the notification area instead.
fn closes_to_tray<R: Runtime>(app: &AppHandle<R>) -> bool {
    let enabled = app
        .try_state::<AppConfigStore>()
        .and_then(|store| store.get().ok())
        .is_some_and(|config| config.close_to_tray);
    enabled && tray::exists(app)
}

/// Build and run the Tauri application until the main window closes.
///
/// # Errors
///
/// Returns an error when a plugin fails to initialize or the runtime cannot start.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> tauri::Result<()> {
    tauri::Builder::default()
        .plugin(logging::plugin())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::accounts::list_accounts,
            commands::accounts::save_account,
            commands::accounts::delete_account,
            commands::accounts::get_launch_choice,
            commands::app_config::get_app_config,
            commands::app_config::save_app_config,
            commands::assets::list_assets,
            commands::assets::get_resources_dir,
            commands::assets::select_exe,
            commands::assets::select_custom_asset,
            commands::boot::run_boot,
            commands::games::list_games,
            commands::games::add_game,
            commands::games::update_game,
            commands::games::remove_game,
            commands::games::reorder_games,
            commands::sdk::get_sdk_status,
            commands::sdk::get_capabilities,
            commands::sdk::install_sdk,
            commands::sdk::check_sdk_update,
            commands::sdk::get_sdk_license,
            commands::sdk::open_external_url,
            commands::servers::list_servers,
            commands::servers::save_custom_server,
            commands::servers::add_custom_realm,
            commands::session::get_session,
            commands::session::launch_game,
            commands::presence::set_presence_strings,
            commands::presence::preview_presence,
            commands::presence::get_presence_assets,
            commands::tray::set_tray_strings,
            commands::notifications::set_notification_strings,
            commands::settings::get_settings_schema,
            commands::settings::list_settings_versions,
            commands::settings::get_game_settings,
            commands::settings::save_game_settings,
            commands::settings::scan_game_config,
            commands::settings::apply_game_settings,
            commands::settings::pull_game_settings,
            commands::system::get_display_resolution,
            commands::system::list_audio_devices,
            commands::addons::list_addon_accounts,
            commands::addons::list_addons,
            commands::addons::set_addons_enabled,
            commands::addons::install_addons,
            commands::addons::delete_addon,
            commands::addons::open_addons_folder,
            commands::themes::list_themes,
            commands::themes::get_active_theme,
            commands::themes::import_theme,
            commands::themes::delete_theme,
            commands::themes::open_themes_folder,
        ])
        .setup(|app| {
            let paths = AppPaths::resolve(app.handle())?;
            let database = Database::open(&paths.database_file())?;
            let schemas = SchemaRegistry::load()?;
            tracing::info!(
                data_dir = %paths.root().display(),
                config = %paths.config_file().display(),
                database = %paths.database_file().display(),
                tools = %paths.tools_dir().display(),
                "ZForge host started"
            );
            let config_store = AppConfigStore::new(paths.config_file());
            let startup_config = config_store.get().unwrap_or_default();
            app.manage(config_store);
            app.manage(paths);
            app.manage(database);
            app.manage(schemas);
            app.manage(ReleaseClient::new()?);
            app.manage(SdkInstaller::default());
            app.manage(PresenceAssets::default());
            app.manage(BootState::default());
            let session = GameSession::new();
            forward_session_changes(app.handle(), &session);
            follow_games_with_window(app.handle(), &session);
            store_seen_characters(app.handle(), &session);
            app.manage(PresenceService::start(
                DISCORD_CLIENT_ID,
                startup_config.discord_enabled,
                startup_config.presence,
                session.subscribe(),
            ));
            app.manage(session);
            app.manage(NotificationService::start(
                app.handle().clone(),
                startup_config.notifications,
            ));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event
                && tray::is_main_window(window.label())
                && closes_to_tray(window.app_handle())
            {
                api.prevent_close();
                if let Err(error) = window.hide() {
                    tracing::warn!(%error, "Could not hide the launcher window");
                }
            }
        })
        .run(tauri::generate_context!())
}
