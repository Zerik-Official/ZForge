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
    /// Whether the games in the home dock can be reordered by dragging them.
    pub dock_reorder: bool,
    /// Whether closing the window keeps the launcher running in the notification area.
    pub close_to_tray: bool,
    /// What the launcher window does when a game starts.
    pub launch_behavior: LaunchBehavior,
    /// Whether the window comes back when the game closes, after hiding or minimizing it.
    pub restore_after_game: bool,
    /// What Discord Rich Presence reveals about the game.
    pub presence: PresenceOptions,
    /// Hashes of SDK binaries the user chose to use although they differ from the release.
    pub trusted_sdk: Option<String>,
}

/// What the launcher window does when a game starts.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LaunchBehavior {
    /// Stay as it is.
    #[default]
    Keep,
    /// Minimize to the taskbar.
    Minimize,
    /// Hide in the notification area.
    Tray,
}

/// How much of the character location Rich Presence shows.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocationPrivacy {
    /// Zone, sub-zone and instance difficulty.
    #[default]
    Exact,
    /// Only the zone.
    Zone,
    /// A random zone that changes whenever the real zone changes.
    Random,
    /// No location.
    Hidden,
}

/// What Discord Rich Presence reveals about the game.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct PresenceOptions {
    /// Character name.
    pub show_name: bool,
    /// Character level.
    pub show_level: bool,
    /// Experience percentage below the level cap.
    pub show_xp: bool,
    /// Class icon with the race and class.
    pub show_class: bool,
    /// How much of the location to show.
    pub location: LocationPrivacy,
    /// In combat, dead, ghost or away.
    pub show_status: bool,
    /// Party or raid and its size.
    pub show_group: bool,
    /// Time since the game started.
    pub show_elapsed: bool,
}

impl Default for PresenceOptions {
    fn default() -> Self {
        Self {
            show_name: true,
            show_level: true,
            show_xp: true,
            show_class: true,
            location: LocationPrivacy::Exact,
            show_status: true,
            show_group: true,
            show_elapsed: true,
        }
    }
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
    /// New dock reordering flag.
    pub dock_reorder: Option<bool>,
    /// New close-to-tray flag.
    pub close_to_tray: Option<bool>,
    /// New behavior when a game starts.
    pub launch_behavior: Option<LaunchBehavior>,
    /// New restore-after-game flag.
    pub restore_after_game: Option<bool>,
    /// New Rich Presence options.
    pub presence: Option<PresenceOptions>,
    /// New trusted SDK hashes; `Some(None)` clears them.
    #[serde(deserialize_with = "present")]
    pub trusted_sdk: Option<Option<String>>,
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
        if let Some(dock_reorder) = patch.dock_reorder {
            self.dock_reorder = dock_reorder;
        }
        if let Some(close_to_tray) = patch.close_to_tray {
            self.close_to_tray = close_to_tray;
        }
        if let Some(launch_behavior) = patch.launch_behavior {
            self.launch_behavior = launch_behavior;
        }
        if let Some(restore_after_game) = patch.restore_after_game {
            self.restore_after_game = restore_after_game;
        }
        if let Some(presence) = patch.presence {
            self.presence = presence;
        }
        if let Some(trusted_sdk) = patch.trusted_sdk {
            self.trusted_sdk = trusted_sdk;
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
            dock_reorder: true,
            close_to_tray: false,
            launch_behavior: LaunchBehavior::Keep,
            restore_after_game: true,
            presence: PresenceOptions::default(),
            trusted_sdk: None,
        }
    }
}
