//! Windows notification commands.

use tauri::State;

use crate::error::AppResult;
use crate::services::notifications::NotificationService;
use crate::services::notifications::strings::NotificationStrings;

/// Use these translated texts for notifications (sent on startup and when the language changes).
#[tauri::command]
pub async fn set_notification_strings(
    notifications: State<'_, NotificationService>,
    strings: NotificationStrings,
) -> AppResult<()> {
    notifications.set_strings(strings);
    Ok(())
}
