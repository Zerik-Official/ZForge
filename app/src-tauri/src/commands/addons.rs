//! Addon commands: list addons and accounts, enable or disable addons,
//! install addon archives, delete addons and open the addons folder.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use crate::commands::assets::pick_file;
use crate::domain::addon::{Addon, AddonAccount, AddonTarget};
use crate::domain::game::Game;
use crate::error::{AppError, AppResult};
use crate::services::addons;
use crate::storage::Database;

fn game(database: &Database, game_id: &str) -> AppResult<Game> {
    database
        .get_game(game_id)?
        .ok_or_else(|| AppError::NotFound {
            entity: "game",
            id: game_id.to_owned(),
        })
}

fn game_root(game: &Game) -> PathBuf {
    let exe = Path::new(&game.exe_path);
    exe.parent().map_or_else(PathBuf::new, Path::to_path_buf)
}

/// Accounts, realms and characters found in the game's `WTF` folder.
#[tauri::command]
pub async fn list_addon_accounts(
    database: State<'_, Database>,
    game_id: String,
) -> AppResult<Vec<AddonAccount>> {
    addons::accounts(&game_root(&game(&database, &game_id)?))
}

/// Installed addons and whether they are enabled for the target.
#[tauri::command]
pub async fn list_addons(
    database: State<'_, Database>,
    game_id: String,
    target: Option<AddonTarget>,
) -> AppResult<Vec<Addon>> {
    let game = game(&database, &game_id)?;
    addons::list(&game_root(&game), &game.expansion, target.as_ref())
}

/// Enable or disable addons for the target.
#[tauri::command]
pub async fn set_addons_enabled(
    database: State<'_, Database>,
    game_id: String,
    target: AddonTarget,
    folders: Vec<String>,
    enabled: bool,
) -> AppResult<()> {
    let root = game_root(&game(&database, &game_id)?);
    addons::set_enabled(&root, &target, &folders, enabled)
}

/// Let the user pick an addon zip and install it; `None` when cancelled.
#[tauri::command]
pub async fn install_addons<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    game_id: String,
) -> AppResult<Option<Vec<String>>> {
    let root = game_root(&game(&database, &game_id)?);
    let Some(archive) = pick_file(&app, "Addon", &["zip"]).await? else {
        return Ok(None);
    };
    let installed = tauri::async_runtime::spawn_blocking(move || addons::install(&root, &archive))
        .await
        .map_err(|error| AppError::BackgroundTask(error.to_string()))?;
    if let Err(error) = &installed {
        tracing::warn!(%error, "Addon install failed");
    }
    installed.map(Some)
}

/// Delete an installed addon folder.
#[tauri::command]
pub async fn delete_addon(
    database: State<'_, Database>,
    game_id: String,
    folder: String,
) -> AppResult<()> {
    let root = game_root(&game(&database, &game_id)?);
    tauri::async_runtime::spawn_blocking(move || addons::delete(&root, &folder))
        .await
        .map_err(|error| AppError::BackgroundTask(error.to_string()))?
}

/// Open the game's `Interface\AddOns` folder, creating it if needed.
#[tauri::command]
pub async fn open_addons_folder<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    game_id: String,
) -> AppResult<()> {
    let folder = addons::addons_dir(&game_root(&game(&database, &game_id)?));
    fs::create_dir_all(&folder)?;
    app.opener()
        .open_path(folder.to_string_lossy(), None::<&str>)
        .map_err(|error| AppError::Opener(error.to_string()))
}
