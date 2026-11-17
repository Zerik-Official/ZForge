//! Game launch and session commands.

use std::path::Path;

use tauri::{AppHandle, Manager, Runtime, State};

use crate::domain::account::LaunchChoice;
use crate::domain::game_settings::SettingValue;
use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use crate::services::accounts;
use crate::services::game_settings::SettingsContext;
use crate::services::launcher::{self, LaunchOptions};
use crate::services::sdk::auth::{self, SessionToken};
use crate::services::sdk::installation;
use crate::services::sdk::version::SdkVersion;
use crate::services::session::{GameSession, LaunchMode, SessionSnapshot};
use crate::services::settings_schema::SchemaRegistry;
use crate::services::system;
use crate::storage::Database;

/// First SDK version whose injector accepts `--hidden`.
const FIRST_VERSION_WITH_HIDDEN_START: &str = "2.2.0";

fn supports_hidden_start(version: &str) -> bool {
    match (
        SdkVersion::parse(version),
        SdkVersion::parse(FIRST_VERSION_WITH_HIDDEN_START),
    ) {
        (Some(installed), Some(first)) => installed >= first,
        _ => false,
    }
}

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
///
/// With a `choice` naming an account, the SDK logs in, selects the realm and
/// enters the world with the character; a hidden launch shows the window
/// once that finished. The choice is remembered for the game.
#[tauri::command]
pub async fn launch_game<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    schemas: State<'_, SchemaRegistry>,
    paths: State<'_, AppPaths>,
    session: State<'_, GameSession>,
    game_id: String,
    choice: Option<LaunchChoice>,
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
    let choice = choice.unwrap_or_default();
    if let Err(error) = database.save_launch_choice(&game_id, &choice) {
        tracing::warn!(%error, "Could not remember the launch choice");
    }
    let fallback_realm = match settings.get("realm_name") {
        Some(SettingValue::Text(realm)) => realm.clone(),
        _ => String::new(),
    };
    let auto_login = accounts::auto_login(&database, &choice, &fallback_realm)?;
    let mut options = LaunchOptions::from_settings(&settings);
    let sdk = installation::find_valid(&paths.tools_dir())?;
    let needs_sdk = auto_login.is_some() || choice.headless;
    if needs_sdk
        && sdk
            .as_ref()
            .is_none_or(|sdk| choice.headless && !supports_hidden_start(&sdk.version))
    {
        return Err(AppError::AccountRequiresSdk);
    }
    options.hidden = choice.headless;

    match sdk {
        Some(sdk) => {
            let token = if auth::version_requires_auth(&sdk.version) {
                Some(SessionToken::generate()?)
            } else {
                None
            };
            session.begin(&game, LaunchMode::Sdk)?;
            if let Err(error) = session
                .set_token(token.clone())
                .and_then(|()| session.set_auto_login(auto_login))
            {
                session.finish(Some(&error));
                return Err(error);
            }
            tauri::async_runtime::spawn(async move {
                let session = app.state::<GameSession>();
                let launched = tauri::async_runtime::spawn_blocking(move || {
                    launcher::launch_injected(&game, &options, &sdk, token.as_ref())
                })
                .await
                .map_err(|error| AppError::BackgroundTask(error.to_string()))
                .and_then(|result| result);
                match launched {
                    Ok(pid) => {
                        session.set_game_pid(Some(pid));
                        session.run_sdk().await;
                    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hidden_start_needs_sdk_22() {
        assert!(supports_hidden_start("v2.2.0"));
        assert!(supports_hidden_start("2.10"));
        assert!(!supports_hidden_start("2.1.3"));
        assert!(!supports_hidden_start("unknown"));
    }
}
