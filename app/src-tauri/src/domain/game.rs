//! User-added World of Warcraft installations.

use serde::{Deserialize, Serialize};

use crate::domain::UnixMillis;

/// A saved game installation shown in the launcher.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Game {
    /// Unique identifier (UUID v4).
    pub id: String,
    /// Display name.
    pub name: String,
    /// Expansion key, for example `wotlk`.
    pub expansion: String,
    /// Absolute path of the game executable.
    pub exe_path: String,
    /// Background video shown on the home stage.
    pub bg_video: String,
    /// Dock icon.
    pub icon: String,
    /// Expansion logo.
    pub poster: String,
    /// Box art.
    #[serde(rename = "box")]
    pub box_art: String,
    /// Whether the game appears in the home dock.
    pub show_on_main: bool,
    /// Creation time.
    pub created_at: UnixMillis,
    /// Position in the home dock (ascending).
    pub sort_order: i64,
}

/// Editable game fields sent by the frontend when creating or updating a game.
///
/// Identity and audit fields (`id`, `created_at`, `sort_order`) are owned by the backend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameDraft {
    /// Display name.
    pub name: String,
    /// Expansion key, for example `wotlk`.
    pub expansion: String,
    /// Absolute path of the game executable.
    pub exe_path: String,
    /// Background video shown on the home stage.
    pub bg_video: String,
    /// Dock icon.
    pub icon: String,
    /// Expansion logo.
    pub poster: String,
    /// Box art; empty means "use the expansion default".
    #[serde(rename = "box", default)]
    pub box_art: String,
    /// Whether the game appears in the home dock.
    pub show_on_main: bool,
}

impl Game {
    /// Overwrite the editable fields with the values from a draft.
    pub fn apply_draft(&mut self, draft: GameDraft) {
        self.name = draft.name;
        self.expansion = draft.expansion;
        self.exe_path = draft.exe_path;
        self.bg_video = draft.bg_video;
        self.icon = draft.icon;
        self.poster = draft.poster;
        self.box_art = draft.box_art;
        self.show_on_main = draft.show_on_main;
    }
}
