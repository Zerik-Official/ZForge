//! Global launcher preferences persisted to `config.json`.

use serde::{Deserialize, Deserializer, Serialize};

/// Languages the launcher UI supports.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppLanguage {
    /// English.
    En,
    /// Spanish.
    Es,
}

/// Global launcher preferences.
///
/// Unknown keys are ignored and missing keys fall back to defaults, so the
/// file stays readable across launcher versions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// UI theme identifier.
    pub theme: String,
    /// Identifier of the last selected game.
    pub last_active_game: Option<String>,
    /// Preferred UI language; `None` follows the frontend default.
    #[serde(deserialize_with = "lenient_language")]
    pub language: Option<AppLanguage>,
    /// Whether Discord Rich Presence is enabled.
    pub discord_enabled: bool,
    /// Whether the SDK should be updated automatically.
    pub discord_auto_update: bool,
    /// Error code of the last failed SDK operation.
    pub sdk_last_error: Option<String>,
    /// Whether the SDK was installed at least once.
    pub sdk_ever_installed: bool,
    /// Windows notifications about the game (SDK 2.1+).
    pub notifications: NotificationSettings,
}

/// Which Windows notifications the launcher shows while a game runs (SDK 2.1+).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct NotificationSettings {
    /// Master switch.
    pub enabled: bool,
    /// Only notify when the game is not the foreground window.
    pub only_when_unfocused: bool,
    /// Friends connecting and disconnecting.
    pub friends: bool,
    /// Whispers.
    pub whispers: bool,
    /// Group invitations, with Accept and Decline.
    pub group_invites: bool,
    /// Summons, with Accept and Decline.
    pub summons: bool,
    /// Dungeon Finder groups, with Enter and Leave queue.
    pub dungeon_finder: bool,
    /// Trade requests, with Accept and Decline.
    pub trades: bool,
    /// Duel requests, with Accept and Decline.
    pub duels: bool,
    /// Battlegrounds and arenas ready, with Enter and Leave queue.
    pub battlegrounds: bool,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            only_when_unfocused: true,
            friends: true,
            whispers: true,
            group_invites: true,
            summons: true,
            dungeon_finder: true,
            trades: true,
            duels: true,
            battlegrounds: true,
        }
    }
}

/// A partial update of [`AppConfig`] sent by the frontend.
///
/// Missing fields are left unchanged. For nullable fields, an explicit `null`
/// clears the value.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct AppConfigPatch {
    /// New theme.
    pub theme: Option<String>,
    /// New last active game; `Some(None)` clears it.
    #[serde(deserialize_with = "present")]
    pub last_active_game: Option<Option<String>>,
    /// New language; `Some(None)` clears it. Unsupported codes are ignored.
    #[serde(deserialize_with = "present_language")]
    pub language: Option<Option<AppLanguage>>,
    /// New Discord Rich Presence flag.
    pub discord_enabled: Option<bool>,
    /// New SDK auto-update flag.
    pub discord_auto_update: Option<bool>,
    /// New last SDK error; `Some(None)` clears it.
    #[serde(deserialize_with = "present")]
    pub sdk_last_error: Option<Option<String>>,
    /// New "SDK installed at least once" flag.
    pub sdk_ever_installed: Option<bool>,
    /// New notification settings.
    pub notifications: Option<NotificationSettings>,
}

/// Mark a field as present (including an explicit `null`).
fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
    deserializer: D,
) -> Result<Option<Option<T>>, D::Error> {
    Option::<T>::deserialize(deserializer).map(Some)
}

/// Like [`present`], but an unsupported language leaves the field unchanged.
fn present_language<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Option<AppLanguage>>, D::Error> {
    let raw = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(match raw {
        None => Some(None),
        Some(value) => serde_json::from_value(value).ok().map(Some),
    })
}

impl AppConfig {
    /// Apply a partial update.
    pub fn apply(&mut self, patch: AppConfigPatch) {
        if let Some(theme) = patch.theme {
            self.theme = theme;
        }
        if let Some(last_active_game) = patch.last_active_game {
            self.last_active_game = last_active_game;
        }
        if let Some(language) = patch.language {
            self.language = language;
        }
        if let Some(discord_enabled) = patch.discord_enabled {
            self.discord_enabled = discord_enabled;
        }
        if let Some(discord_auto_update) = patch.discord_auto_update {
            self.discord_auto_update = discord_auto_update;
        }
        if let Some(sdk_last_error) = patch.sdk_last_error {
            self.sdk_last_error = sdk_last_error.filter(|error| !error.trim().is_empty());
        }
        if let Some(sdk_ever_installed) = patch.sdk_ever_installed {
            self.sdk_ever_installed = sdk_ever_installed;
        }
        if let Some(notifications) = patch.notifications {
            self.notifications = notifications;
        }
    }
}

/// Treat unsupported language codes as "not set" instead of rejecting the whole file.
fn lenient_language<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<AppLanguage>, D::Error> {
    let raw = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(raw.and_then(|value| serde_json::from_value(value).ok()))
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_owned(),
            last_active_game: None,
            language: None,
            discord_enabled: false,
            discord_auto_update: true,
            sdk_last_error: None,
            sdk_ever_installed: false,
            notifications: NotificationSettings::default(),
        }
    }
}
