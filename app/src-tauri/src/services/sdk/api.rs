//! Typed wrappers for the SDK JSON-RPC methods the launcher uses.
//!
//! Responses keep only the fields the launcher needs; unknown fields are
//! ignored and missing ones fall back to defaults, so newer SDK versions stay
//! compatible.

use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::services::sdk::rpc::RpcClient;

/// `client.getScreen`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ScreenInfo {
    /// Glue screen name: `login`, `charselect`, or empty in the world.
    pub screen: String,
    /// Whether the player is in the world.
    pub in_world: bool,
}

/// `player.getState` (subset).
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PlayerState {
    /// Character level.
    pub level: u32,
    /// Race id.
    pub race: u32,
    /// Class id.
    pub class: u32,
    /// Current health.
    pub health: u64,
    /// Maximum health.
    pub max_health: u64,
    /// Current experience.
    pub xp: u64,
    /// Experience needed for the next level.
    pub max_xp: u64,
    /// In combat.
    pub in_combat: bool,
    /// Dead.
    pub dead: bool,
    /// Released as a ghost.
    pub ghost: bool,
    /// Mounted.
    pub mounted: bool,
    /// Flying.
    pub flying: bool,
    /// Swimming.
    pub swimming: bool,
    /// Away from keyboard.
    pub afk: bool,
    /// Do not disturb.
    pub dnd: bool,
    /// Whether the SDK state cache is populated.
    pub valid: bool,
}

/// `world.getState` (subset).
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct WorldState {
    /// Map or instance id.
    pub map_id: u32,
    /// Zone id.
    pub zone_id: u32,
    /// Localized zone name.
    pub zone_name: String,
    /// Localized sub-zone name.
    pub sub_zone_name: String,
    /// Whether the world is still loading.
    pub loading: bool,
    /// Whether the SDK state cache is populated.
    pub valid: bool,
}

/// `unit.get` (subset).
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct UnitInfo {
    /// Whether the unit resolved.
    pub exists: bool,
    /// Unit name.
    pub name: String,
}

/// `group.get` (subset).
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GroupState {
    /// Whether the player is in a group.
    pub valid: bool,
    /// `party`, `raid` or `none`.
    #[serde(rename = "type")]
    pub kind: String,
    /// Other members currently known to the client (the player is not included).
    pub member_count: u32,
}

#[derive(Debug, Serialize)]
struct UnitParams<'a> {
    token: &'a str,
}

#[derive(Debug, Serialize)]
struct EventsParams<'a> {
    events: &'a [&'a str],
}

/// Typed access to the SDK.
#[derive(Debug, Clone, Copy)]
pub struct SdkApi<'a> {
    rpc: &'a RpcClient,
}

impl<'a> SdkApi<'a> {
    /// Wrap an RPC client.
    pub fn new(rpc: &'a RpcClient) -> Self {
        Self { rpc }
    }

    /// Current glue screen.
    ///
    /// # Errors
    ///
    /// Fails when the SDK is unreachable or reports an error.
    pub async fn screen(&self) -> AppResult<ScreenInfo> {
        self.rpc.call("client.getScreen").await
    }

    /// Cached state of the player character.
    ///
    /// # Errors
    ///
    /// Fails when the SDK is unreachable or reports an error.
    pub async fn player_state(&self) -> AppResult<PlayerState> {
        self.rpc.call("player.getState").await
    }

    /// Cached state of the current zone.
    ///
    /// # Errors
    ///
    /// Fails when the SDK is unreachable or reports an error.
    pub async fn world_state(&self) -> AppResult<WorldState> {
        self.rpc.call("world.getState").await
    }

    /// Information about a unit token such as `player`.
    ///
    /// # Errors
    ///
    /// Fails when the SDK is unreachable or reports an error.
    pub async fn unit(&self, token: &str) -> AppResult<UnitInfo> {
        self.rpc
            .call_with("unit.get", Some(UnitParams { token }))
            .await
    }

    /// The player's party or raid.
    ///
    /// # Errors
    ///
    /// Fails when the SDK is unreachable or reports an error.
    pub async fn group(&self) -> AppResult<GroupState> {
        self.rpc.call("group.get").await
    }

    /// Stream these WoW UI events through the event pipe.
    ///
    /// # Errors
    ///
    /// Fails when the SDK is unreachable or reports an error.
    pub async fn subscribe(&self, events: &[&str]) -> AppResult<()> {
        let _: serde::de::IgnoredAny = self
            .rpc
            .call_with("events.subscribe", Some(EventsParams { events }))
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tolerates_partial_and_extra_fields() -> Result<(), serde_json::Error> {
        let player: PlayerState = serde_json::from_str(
            r#"{"level":80,"class":6,"inCombat":true,"guid":[1,2],"position":{"x":1}}"#,
        )?;
        assert_eq!(player.level, 80);
        assert!(player.in_combat);
        assert!(!player.valid);

        let world: WorldState =
            serde_json::from_str(r#"{"mapId":571,"zoneName":"Dalaran","valid":true}"#)?;
        assert_eq!(world.zone_name, "Dalaran");
        Ok(())
    }
}
