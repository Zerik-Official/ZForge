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
use crate::services::sdk::events::LoadingBackground;
use crate::services::sdk::release::ReleaseClient;
use crate::services::session::{
    CharacterInfo, GameSession, GroupInfo, GroupKind, InstanceInfo, InstanceKind,
    LoadingScreenInfo, LocationInfo, PlayerStatus, SessionPhase, SessionSnapshot,
};

/// Time the sample session has been running, for the elapsed time of the preview.
const SAMPLE_ELAPSED_MS: i64 = 83 * 60 * 1000;

/// Moment of a game session the preview shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PresenceScene {
    /// The running game, when there is one.
    Live,
    /// The game is starting.
    Launching,
    /// Login screen.
    Login,
    /// Choosing a realm.
    RealmList,
    /// Character selection.
    CharacterSelect,
    /// Character creation.
    CharacterCreate,
    /// A loading screen halfway.
    Loading,
    /// In the world, alone.
    World,
    /// In the world, in a party.
    Party,
    /// In the world, in a raid.
    Raid,
    /// Away, in a party.
    Afk,
    /// In combat.
    Combat,
    /// Dead.
    Dead,
    /// In a heroic dungeon.
    Dungeon,
}

/// Character and places the preview shows; the names come translated from the frontend.
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
    /// Zone in the open world.
    pub zone: String,
    /// Sub-zone in the open world.
    pub sub_zone: String,
    /// Map of the zone.
    pub map_id: u32,
    /// `WorldMapArea` id of the zone, for its image.
    pub map_area_id: Option<u32>,
    /// Name of the sample dungeon.
    pub dungeon: String,
    /// Name of the sample raid.
    pub raid: String,
    /// Expansion key of the game, which limits the random zones.
    pub expansion: Option<String>,
    /// Realm list host, for the server logo of the screens before the world.
    pub realmlist: Option<String>,
    /// Realm name.
    pub realm: Option<String>,
}

impl PresenceSample {
    fn snapshot(self, scene: PresenceScene) -> SessionSnapshot {
        let phase = match scene {
            PresenceScene::Launching => SessionPhase::Launching,
            PresenceScene::Login => SessionPhase::Login,
            PresenceScene::RealmList => SessionPhase::RealmList,
            PresenceScene::CharacterSelect => SessionPhase::CharacterSelect,
            PresenceScene::CharacterCreate => SessionPhase::CharacterCreate,
            PresenceScene::Loading => SessionPhase::Loading,
            _ => SessionPhase::InWorld,
        };
        let mut snapshot = SessionSnapshot {
            phase,
            expansion: self.expansion,
            started_at: Some(now_millis() - SAMPLE_ELAPSED_MS),
            realmlist: self.realmlist,
            realm: self.realm,
            ..SessionSnapshot::default()
        };
        if phase == SessionPhase::Loading {
            snapshot.loading_progress = Some(0.62);
            snapshot.loading_screen = Some(LoadingScreenInfo {
                map_id: Some(0),
                background: Some(LoadingBackground {
                    id: 4,
                    name: "Azeroth".to_owned(),
                    file: r"Interface\Glues\LoadingScreens\LoadScreenEasternKingdom.blp".to_owned(),
                    has_wide_screen: true,
                }),
            });
        }
        if phase != SessionPhase::InWorld {
            return snapshot;
        }
        snapshot.character = Some(CharacterInfo {
            name: self.name,
            level: self.level,
            race_id: self.race_id,
            class_id: self.class_id,
            xp: 62,
            max_xp: 100,
        });
        let (map_id, map_area_id, zone, instance) = match scene {
            PresenceScene::Dungeon => (
                599,
                Some(526),
                self.dungeon.clone(),
                Some(InstanceInfo {
                    kind: InstanceKind::Party,
                    name: self.dungeon,
                    difficulty: 2,
                    max_players: 5,
                }),
            ),
            PresenceScene::Raid => (
                631,
                Some(605),
                self.raid.clone(),
                Some(InstanceInfo {
                    kind: InstanceKind::Raid,
                    name: self.raid,
                    difficulty: 2,
                    max_players: 25,
                }),
            ),
            _ => (self.map_id, self.map_area_id, self.zone, None),
        };
        snapshot.location = Some(LocationInfo {
            map_id,
            zone_id: map_id,
            map_area_id,
            zone,
            sub_zone: if instance.is_some() {
                String::new()
            } else {
                self.sub_zone
            },
            instance,
        });
        snapshot.status = Some(PlayerStatus {
            in_combat: scene == PresenceScene::Combat,
            dead: scene == PresenceScene::Dead,
            afk: scene == PresenceScene::Afk,
            ..PlayerStatus::default()
        });
        snapshot.group = Some(match scene {
            PresenceScene::Party | PresenceScene::Afk | PresenceScene::Combat => GroupInfo {
                kind: GroupKind::Party,
                members: 2,
            },
            PresenceScene::Dungeon => GroupInfo {
                kind: GroupKind::Party,
                members: 5,
            },
            PresenceScene::Raid => GroupInfo {
                kind: GroupKind::Raid,
                members: 18,
            },
            _ => GroupInfo {
                kind: GroupKind::Solo,
                members: 1,
            },
        });
        snapshot
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

/// What Discord would show with these options for a scene of the sample session, or for
/// the running game with [`PresenceScene::Live`].
#[tauri::command]
pub async fn preview_presence(
    presence: State<'_, PresenceService>,
    session: State<'_, GameSession>,
    options: PresenceOptions,
    scene: PresenceScene,
    sample: PresenceSample,
) -> AppResult<Option<PresenceActivity>> {
    let Some(strings) = presence.strings() else {
        return Ok(None);
    };
    let snapshot = match scene {
        PresenceScene::Live => session.snapshot(),
        scene => sample.snapshot(scene),
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
