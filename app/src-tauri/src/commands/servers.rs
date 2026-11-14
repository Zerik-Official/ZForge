//! Realm list catalogue commands.

use serde::Deserialize;
use tauri::State;

use crate::domain::server::ServerEntry;
use crate::error::AppResult;
use crate::services::servers;
use crate::storage::Database;

/// A realm list typed by the user in the game settings modal.
#[derive(Debug, Deserialize)]
pub struct CustomServerInput {
    realmlist: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    realm: Option<String>,
}

/// Bundled servers followed by the user's saved realm lists.
#[tauri::command]
pub async fn list_servers(database: State<'_, Database>) -> AppResult<Vec<ServerEntry>> {
    servers::list(&database)
}

/// Save a new realm list globally.
#[tauri::command]
pub async fn save_custom_server(
    database: State<'_, Database>,
    server: CustomServerInput,
) -> AppResult<()> {
    servers::save_custom(
        &database,
        &server.realmlist,
        server.name.as_deref(),
        server.realm.as_deref(),
    )
}

/// Append a realm to a saved realm list.
#[tauri::command]
pub async fn add_custom_realm(
    database: State<'_, Database>,
    realmlist: String,
    realm: String,
) -> AppResult<()> {
    servers::add_custom_realm(&database, &realmlist, &realm)
}
