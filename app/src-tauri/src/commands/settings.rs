//! Per-game settings and settings schema commands.

use tauri::{AppHandle, Runtime, State};

use crate::domain::game_settings::SettingsValues;
use crate::domain::settings_schema::SettingsSchema;
use crate::error::AppResult;
use crate::services::game_settings::SettingsContext;
use crate::services::settings_schema::SchemaRegistry;
use crate::services::system;
use crate::storage::Database;

/// Run an operation with a settings context built from the managed state.
fn with_context<R: Runtime, T>(
    app: &AppHandle<R>,
    database: &Database,
    schemas: &SchemaRegistry,
    operation: impl FnOnce(SettingsContext<'_>) -> AppResult<T>,
) -> AppResult<T> {
    let dynamic = system::dynamic_defaults(app);
    operation(SettingsContext {
        database,
        schemas,
        dynamic: &dynamic,
    })
}

/// A settings schema by identifier.
#[tauri::command]
pub async fn get_settings_schema(
    schemas: State<'_, SchemaRegistry>,
    version_id: String,
) -> AppResult<SettingsSchema> {
    schemas.get(&version_id).cloned()
}

/// Identifiers of every bundled settings schema.
#[tauri::command]
pub async fn list_settings_versions(schemas: State<'_, SchemaRegistry>) -> AppResult<Vec<String>> {
    Ok(schemas.ids())
}

/// Saved settings of a game, or `None` when nothing is stored yet.
#[tauri::command]
pub async fn get_game_settings<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    schemas: State<'_, SchemaRegistry>,
    game_id: String,
) -> AppResult<Option<SettingsValues>> {
    with_context(&app, &database, &schemas, |context| context.get(&game_id))
}

/// Store settings edited in the launcher.
#[tauri::command]
pub async fn save_game_settings<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    schemas: State<'_, SchemaRegistry>,
    game_id: String,
    values: SettingsValues,
) -> AppResult<SettingsValues> {
    with_context(&app, &database, &schemas, |context| {
        context.save(&game_id, &values).map(|stored| stored.values)
    })
}

/// Settings currently stored in the game files.
#[tauri::command]
pub async fn scan_game_config<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    schemas: State<'_, SchemaRegistry>,
    game_id: String,
) -> AppResult<SettingsValues> {
    with_context(&app, &database, &schemas, |context| context.scan(&game_id))
}

/// Write the saved settings into the game files.
#[tauri::command]
pub async fn apply_game_settings<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    schemas: State<'_, SchemaRegistry>,
    game_id: String,
) -> AppResult<()> {
    with_context(&app, &database, &schemas, |context| context.apply(&game_id))
}

/// Replace the saved settings with what the game files hold.
#[tauri::command]
pub async fn pull_game_settings<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    schemas: State<'_, SchemaRegistry>,
    game_id: String,
) -> AppResult<SettingsValues> {
    with_context(&app, &database, &schemas, |context| {
        context.pull(&game_id).map(|stored| stored.values)
    })
}
