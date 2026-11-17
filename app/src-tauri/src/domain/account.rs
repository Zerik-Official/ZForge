//! Game accounts, their characters and how a game is launched with them.

use serde::{Deserialize, Serialize};

use crate::domain::UnixMillis;

/// A game account on a server. Its password lives in the Windows Credential
/// Manager, never in this structure.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Account {
    /// Unique identifier (UUID v4).
    pub id: String,
    /// Realm list host of the server.
    pub realmlist: String,
    /// Login name.
    pub username: String,
    /// Optional display name; empty shows the login name.
    pub label: String,
    /// Realm selected by default when launching with this account.
    pub default_realm: String,
    /// Character selected by default when launching with this account.
    pub default_character: String,
    /// Creation time.
    pub created_at: UnixMillis,
}

/// Editable account fields sent by the frontend.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct AccountDraft {
    /// Realm list host of the server.
    pub realmlist: String,
    /// Login name.
    pub username: String,
    /// Optional display name.
    #[serde(default)]
    pub label: String,
    /// Realm selected by default.
    #[serde(default)]
    pub default_realm: String,
    /// Character selected by default.
    #[serde(default)]
    pub default_character: String,
}

/// A character seen on an account the last time the launcher logged in with it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SavedCharacter {
    /// Realm the character belongs to.
    pub realm: String,
    /// Character name.
    pub name: String,
    /// Slot on the character selection screen, starting at 0.
    pub slot: u32,
    /// Level.
    pub level: u32,
    /// Race id.
    pub race_id: u32,
    /// Class id.
    pub class_id: u32,
    /// Gender id (0 male, 1 female).
    pub gender: u32,
    /// Last known map id.
    pub map_id: u32,
    /// Last known zone id (`AreaTable`).
    pub zone_id: u32,
    /// When the list was read.
    pub updated_at: UnixMillis,
}

/// An account with what the frontend needs to show it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AccountSummary {
    /// The account.
    #[serde(flatten)]
    pub account: Account,
    /// Whether a password is stored.
    pub has_password: bool,
    /// Characters saved for every realm, ordered by realm and slot.
    pub characters: Vec<SavedCharacter>,
}

/// How to start a game; the default starts it as before, without logging in.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct LaunchChoice {
    /// Account to log in with; `None` stops at the login screen.
    pub account_id: Option<String>,
    /// Realm to select; empty lets the client pick the realm saved in its settings.
    pub realm: String,
    /// Character to enter the world with; empty stops at character selection.
    pub character: String,
    /// Keep the game window hidden until the character is in the world.
    pub headless: bool,
}
