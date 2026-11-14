//! Discord Rich Presence commands.

use tauri::State;

use crate::error::AppResult;
use crate::services::presence::PresenceService;
use crate::services::presence::strings::PresenceStrings;

/// Use these translated texts for Rich Presence (sent on startup and when the language changes).
#[tauri::command]
pub async fn set_presence_strings(
    presence: State<'_, PresenceService>,
    strings: PresenceStrings,
) -> AppResult<()> {
    presence.set_strings(strings);
    Ok(())
}
