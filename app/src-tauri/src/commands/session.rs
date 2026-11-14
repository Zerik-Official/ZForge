//! Game launch and session commands.

use std::path::Path;

use tauri::{AppHandle, Manager, Runtime, State};

use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use crate::services::game_settings::SettingsContext;
use crate::services::launcher::{self, LaunchOptions};
use crate::services::sdk::installation;
use crate::services::session::{GameSession, LaunchMode, SessionSnapshot};
use crate::services::settings_schema::SchemaRegistry;
use crate::services::system;
use crate::storage::Database;

/// Current game session.
#[tauri::command]
pub async fn get_session(session: State<'_, GameSession>) -> AppResult<SessionSnapshot> {
    Ok(session.snapshot())
}

/// Start the game client and follow it in the background.
///
/// When a valid SDK is installed the game is started through the injector and
/// its progress is reported with `session://changed`; otherwise it is started
/// directly. Errors that happen after the command returns are recorded in the
/// session's `last_error`.
#[tauri::command]
pub async fn launch_game<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    schemas: State<'_, SchemaRegistry>,
    paths: State<'_, AppPaths>,
    session: State<'_, GameSession>,
    game_id: String,
) -> AppResult<()> {
    let game = database
        .get_game(&game_id)?
        .ok_or_else(|| AppError::NotFound {
            entity: "game",
            id: game_id.clone(),
        })?;
    if !Path::new(&game.exe_path).is_file() {
        return Err(AppError::GameExecutableMissing(game.exe_path.clone()));
    }
    let dynamic = system::dynamic_defaults(&app);
    let settings = SettingsContext {
        database: &database,
        schemas: &schemas,
        dynamic: &dynamic,
    }
    .get(&game_id)?
    .unwrap_or_default();
    let options = LaunchOptions::from_settings(&settings);
    let sdk = installation::find_valid(&paths.tools_dir())?;

    match sdk {
        Some(sdk) => {
            session.begin(&game, LaunchMode::Sdk)?;
            tauri::async_runtime::spawn(async move {
                let session = app.state::<GameSession>();
                let launched = tauri::async_runtime::spawn_blocking(move || {
                    launcher::launch_injected(&game, &options, &sdk)
                })
                .await
                .map_err(|error| AppError::BackgroundTask(error.to_string()))
                .and_then(|result| result);
                match launched {
                    Ok(_) => session.run_sdk().await,
                    Err(error) => session.finish(Some(&error)),
                }
            });
        }
        None => {
            session.begin(&game, LaunchMode::Direct)?;
            let child = match launcher::launch_direct(&game, &options) {
                Ok(child) => child,
                Err(error) => {
                    session.finish(Some(&error));
                    return Err(error);
                }
            };
            tauri::async_runtime::spawn(async move {
                app.state::<GameSession>().run_direct(child).await;
            });
        }
    }
    Ok(())
}
