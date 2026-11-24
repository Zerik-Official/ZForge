//! Discord Rich Presence commands.

use std::collections::BTreeMap;

use serde::Deserialize;
use tauri::State;

use crate::config::DISCORD_CLIENT_ID;
use crate::domain::app_config::PresenceOptions;
use crate::domain::now_millis;
use crate::error::AppResult;
use crate::services::presence::activity::PresenceActivity;
use crate::services::presence::assets::PresenceAssets;
use crate::services::presence::strings::PresenceStrings;
use crate::services::presence::{self, PresenceService};
use crate::services::sdk::release::ReleaseClient;
use crate::services::session::{
    CharacterInfo, GameSession, GroupInfo, GroupKind, LocationInfo, SessionPhase, SessionSnapshot,
};

/// Time the sample session has been running, for the elapsed time of the preview.
const SAMPLE_ELAPSED_MS: i64 = 83 * 60 * 1000;

/// Character and place the preview shows while no character is in the world.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceSample {
    /// Character name.
    pub name: String,
    /// Level.
    pub level: u32,
    /// Race id.
    pub race_id: u32,
    /// Class id.
    pub class_id: u32,
    /// Translated zone name.
    pub zone: String,
    /// Translated sub-zone name.
    pub sub_zone: String,
    /// Map of the zone.
    pub map_id: u32,
    /// `WorldMapArea` id of the zone, for its image.
    pub map_area_id: Option<u32>,
    /// Expansion key of the game, which limits the random zones.
    pub expansion: Option<String>,
}

impl PresenceSample {
    fn snapshot(self) -> SessionSnapshot {
        SessionSnapshot {
            phase: SessionPhase::InWorld,
            expansion: self.expansion,
            started_at: Some(now_millis() - SAMPLE_ELAPSED_MS),
            character: Some(CharacterInfo {
                name: self.name,
                level: self.level,
                race_id: self.race_id,
                class_id: self.class_id,
                xp: 45,
                max_xp: 100,
            }),
            location: Some(LocationInfo {
                map_id: self.map_id,
                zone_id: 0,
                map_area_id: self.map_area_id,
                zone: self.zone,
                sub_zone: self.sub_zone,
                instance: None,
            }),
            group: Some(GroupInfo {
                kind: GroupKind::Party,
                members: 3,
            }),
            ..SessionSnapshot::default()
        }
    }
}

/// Use these translated texts for Rich Presence (sent on startup and when the language changes).
#[tauri::command]
pub async fn set_presence_strings(
    presence: State<'_, PresenceService>,
    strings: PresenceStrings,
) -> AppResult<()> {
    presence.set_strings(strings);
    Ok(())
}

/// What Discord would show with these options: the character in the world, or the sample.
#[tauri::command]
pub async fn preview_presence(
    presence: State<'_, PresenceService>,
    session: State<'_, GameSession>,
    options: PresenceOptions,
    sample: PresenceSample,
) -> AppResult<Option<PresenceActivity>> {
    let Some(strings) = presence.strings() else {
        return Ok(None);
    };
    let live = session.snapshot();
    let snapshot = if live.phase == SessionPhase::InWorld {
        live
    } else {
        sample.snapshot()
    };
    Ok(presence::preview(&snapshot, &strings, &options))
}

/// Addresses of the Rich Presence images by asset key, for the preview.
#[tauri::command]
pub async fn get_presence_assets(
    assets: State<'_, PresenceAssets>,
    release: State<'_, ReleaseClient>,
) -> AppResult<BTreeMap<String, String>> {
    assets.urls(release.http(), DISCORD_CLIENT_ID).await
}
