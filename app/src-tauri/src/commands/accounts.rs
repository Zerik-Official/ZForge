//! Game account commands.

use tauri::State;

use crate::domain::account::{Account, AccountDraft, AccountSummary, LaunchChoice};
use crate::error::AppResult;
use crate::services::accounts;
use crate::services::credentials::Password;
use crate::storage::Database;

/// Every account with its saved characters.
#[tauri::command]
pub async fn list_accounts(database: State<'_, Database>) -> AppResult<Vec<AccountSummary>> {
    accounts::list(&database)
}

/// Create an account (`id` empty) or update one. An empty or missing
/// password keeps the stored one.
#[tauri::command]
pub async fn save_account(
    database: State<'_, Database>,
    id: Option<String>,
    account: AccountDraft,
    password: Option<String>,
) -> AppResult<Account> {
    accounts::save(
        &database,
        id.as_deref().filter(|id| !id.is_empty()),
        account,
        password.map(Password::new),
    )
}

/// Delete an account, its characters and its password.
#[tauri::command]
pub async fn delete_account(database: State<'_, Database>, id: String) -> AppResult<()> {
    accounts::delete(&database, &id)
}

/// How a game was launched last time.
#[tauri::command]
pub async fn get_launch_choice(
    database: State<'_, Database>,
    game_id: String,
) -> AppResult<LaunchChoice> {
    database.get_launch_choice(&game_id)
}
