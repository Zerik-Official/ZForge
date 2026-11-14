//! Game management commands.

use tauri::{AppHandle, Runtime, State};

use crate::domain::game::{Game, GameDraft};
use crate::error::{AppError, AppResult};
use crate::services::game_settings::SettingsContext;
use crate::services::launcher::{self, LaunchOptions};
use crate::services::settings_schema::SchemaRegistry;
use crate::services::{games, system};
use crate::storage::Database;

/// Every saved game in dock order.
#[tauri::command]
pub async fn list_games(database: State<'_, Database>) -> AppResult<Vec<Game>> {
    database.list_games()
}

/// Create a game from the add-game modal and seed its settings from the game files.
#[tauri::command]
pub async fn add_game<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    schemas: State<'_, SchemaRegistry>,
    draft: GameDraft,
) -> AppResult<Game> {
    let game = games::create(&database, draft)?;
    let dynamic = system::dynamic_defaults(&app);
    let context = SettingsContext {
        database: &database,
        schemas: &schemas,
        dynamic: &dynamic,
    };
    if let Err(error) = context.seed(&game) {
        tracing::warn!(game_id = %game.id, %error, "Could not seed settings from game files");
    }
    Ok(game)
}

/// Update the editable fields of a game.
#[tauri::command]
pub async fn update_game(
    database: State<'_, Database>,
    game_id: String,
    draft: GameDraft,
) -> AppResult<Game> {
    games::update(&database, &game_id, draft)
}

/// Delete a game and its settings.
#[tauri::command]
pub async fn remove_game(database: State<'_, Database>, game_id: String) -> AppResult<()> {
    games::remove(&database, &game_id)
}

/// Start the game client with its launch settings.
#[tauri::command]
pub async fn launch_game<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    schemas: State<'_, SchemaRegistry>,
    game_id: String,
) -> AppResult<()> {
    let game = database
        .get_game(&game_id)?
        .ok_or_else(|| AppError::NotFound {
            entity: "game",
            id: game_id.clone(),
        })?;
    let dynamic = system::dynamic_defaults(&app);
    let settings = SettingsContext {
        database: &database,
        schemas: &schemas,
        dynamic: &dynamic,
    }
    .get(&game_id)?
    .unwrap_or_default();
    launcher::launch(&game, &LaunchOptions::from_settings(&settings))?;
    Ok(())
}

/// Persist a new dock order.
#[tauri::command]
pub async fn reorder_games(
    database: State<'_, Database>,
    ordered_ids: Vec<String>,
) -> AppResult<()> {
    database.reorder_games(&ordered_ids)
}
