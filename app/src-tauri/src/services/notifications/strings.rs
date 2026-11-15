//! Notification texts, translated by the frontend.
//!
//! The backend never builds user-facing text: the frontend sends these
//! templates in the user's language and the backend only fills placeholders
//! such as `{name}` or `{zone}`.

use std::collections::BTreeMap;

use serde::Deserialize;

/// Title and body of one notification.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NotificationText {
    /// First line, shown in bold.
    pub title: String,
    /// Second line.
    pub body: String,
}

/// Templates and labels shown in Windows notifications.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NotificationStrings {
    /// Friend connected; placeholders `{name}`, `{level}`, `{class}`, `{zone}`.
    pub friend_online: NotificationText,
    /// Friend disconnected; placeholder `{name}`.
    pub friend_offline: NotificationText,
    /// Whisper; placeholders `{name}`, `{text}`.
    pub whisper: NotificationText,
    /// Group invitation; placeholder `{name}`.
    pub invite: NotificationText,
    /// Summon; placeholders `{name}`, `{zone}`.
    pub summon: NotificationText,
    /// Dungeon Finder proposal; placeholders `{dungeon}`, `{role}`.
    pub proposal: NotificationText,
    /// Trade request; placeholder `{name}`.
    pub trade: NotificationText,
    /// Trade window opened by another player; placeholder `{name}`.
    pub trade_opened: NotificationText,
    /// Duel request; placeholder `{name}`.
    pub duel: NotificationText,
    /// Battleground ready; placeholder `{map}`.
    pub battleground: NotificationText,
    /// Arena ready; placeholders `{map}`, `{size}`.
    pub arena: NotificationText,
    /// Role names by SDK role: `TANK`, `HEALER`, `DAMAGER`.
    pub roles: BTreeMap<String, String>,
    /// "Accept" button.
    pub accept: String,
    /// "Decline" button.
    pub decline: String,
    /// "Enter" button.
    pub enter: String,
    /// "Leave queue" button.
    pub leave_queue: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_partial_translations() -> Result<(), serde_json::Error> {
        let strings: NotificationStrings = serde_json::from_str(
            r#"{"invite":{"title":"Invitación","body":"{name} te invita"},"accept":"Aceptar","roles":{"TANK":"Tanque"}}"#,
        )?;
        assert_eq!(strings.invite.body, "{name} te invita");
        assert_eq!(strings.accept, "Aceptar");
        assert_eq!(
            strings.roles.get("TANK").map(String::as_str),
            Some("Tanque")
        );
        assert!(strings.duel.title.is_empty());
        Ok(())
    }
}
