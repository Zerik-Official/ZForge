//! Typed wrappers for the SDK JSON-RPC methods the launcher uses.
//!
//! Responses keep only the fields the launcher needs; unknown fields are
//! ignored and missing ones fall back to defaults, so newer SDK versions stay
//! compatible.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::services::credentials::Password;
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
    /// `WorldMapArea` id of the current map (SDK 2.1); `0` when unknown.
    pub map_area_id: u32,
    /// Instance type and difficulty (SDK 2.1).
    pub instance: Option<InstanceState>,
    /// Whether the world is still loading.
    pub loading: bool,
    /// Whether the SDK state cache is populated.
    pub valid: bool,
}

/// `world.getState.instance` (subset, SDK 2.1).
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct InstanceState {
    /// Whether the current map is an instance.
    pub in_instance: bool,
    /// `none`, `party`, `raid`, `pvp` or `arena`.
    #[serde(rename = "type")]
    pub kind: String,
    /// Localized map name.
    pub map_name: String,
    /// Difficulty starting at `1`.
    pub difficulty: u32,
    /// Maximum number of players; `0` outside instances.
    pub max_players: u32,
    /// Whether the raid difficulty can change inside.
    pub dynamic: bool,
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
    /// Other members in the list (the player is not included). Before SDK 2.1 only members in range.
    pub member_count: u32,
    /// Group size including the player (SDK 2.1).
    pub size: Option<u32>,
}

#[derive(Debug, Serialize)]
struct UnitParams<'a> {
    token: &'a str,
}

#[derive(Debug, Serialize)]
struct EventsParams<'a> {
    events: &'a [&'a str],
}

#[derive(Debug, Serialize)]
struct IndexParams {
    index: u32,
}

/// `client.login` waits until the login server stops answering for 20 s (SDK
/// 2.2.1+), then up to 5 s for the realm list and 15 s for the character
/// selection screen.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(120);

/// `client.enterWorld` waits up to 30 s for the world to load.
const ENTER_WORLD_TIMEOUT: Duration = Duration::from_secs(45);

/// A character on the selection screen (`client.getCharacters`).
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct SdkCharacter {
    /// Slot, starting at 0.
    pub index: u32,
    /// Character name.
    pub name: String,
    /// Level.
    pub level: u32,
    /// Race id.
    pub race: u32,
    /// Class id.
    pub class: u32,
    /// Gender id.
    pub gender: u32,
    /// Last known map id.
    pub map: u32,
    /// Last known zone id.
    pub zone: u32,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct CharacterList {
    characters: Vec<SdkCharacter>,
}

/// Parameters of `client.login`; deliberately not `Debug` because it holds the password.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginParams<'a> {
    username: &'a str,
    password: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    realm_list: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    realm_name: Option<&'a str>,
}

#[derive(Debug, Serialize)]
struct EnterWorldParams<'a> {
    name: &'a str,
    wait: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReplyParams<'a> {
    text: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    line_id: Option<u64>,
}

/// Result of an SDK action: `{"ok": true}` or `{"error": "..."}`.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ActionResult {
    error: Option<String>,
}

impl ActionResult {
    fn into_result(self, method: &str) -> AppResult<()> {
        match self.error {
            Some(message) => Err(AppError::SdkRpc {
                method: method.to_owned(),
                message,
            }),
            None => Ok(()),
        }
    }
}

/// A native answer the launcher can give in the game's place (SDK 2.1+).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GameAction {
    /// Accept the pending group invitation.
    AcceptInvite,
    /// Decline the pending group invitation.
    DeclineInvite,
    /// Accept the pending summon.
    AcceptSummon,
    /// Decline the pending summon.
    DeclineSummon,
    /// Enter the Dungeon Finder group.
    AcceptProposal,
    /// Leave the Dungeon Finder queue.
    RejectProposal,
    /// Accept the pending trade request.
    AcceptTradeRequest,
    /// Decline the pending trade request.
    DeclineTradeRequest,
    /// Close the open trade window without trading.
    CancelTrade,
    /// Accept the pending duel.
    AcceptDuel,
    /// Decline the pending duel.
    DeclineDuel,
    /// Enter the battleground or arena of a queue slot.
    EnterBattlefield(u32),
    /// Leave a battleground or arena queue slot.
    LeaveBattlefield(u32),
    /// Bring the game window to the foreground.
    FocusWindow,
}

impl GameAction {
    /// JSON-RPC method that performs the action.
    pub fn method(self) -> &'static str {
        match self {
            Self::AcceptInvite => "group.acceptInvite",
            Self::DeclineInvite => "group.declineInvite",
            Self::AcceptSummon => "summon.accept",
            Self::DeclineSummon => "summon.decline",
            Self::AcceptProposal => "lfg.acceptProposal",
            Self::RejectProposal => "lfg.rejectProposal",
            Self::AcceptTradeRequest => "trade.acceptRequest",
            Self::DeclineTradeRequest => "trade.declineRequest",
            Self::CancelTrade => "trade.cancel",
            Self::AcceptDuel => "duel.accept",
            Self::DeclineDuel => "duel.decline",
            Self::EnterBattlefield(_) => "battlefield.acceptPort",
            Self::LeaveBattlefield(_) => "battlefield.leaveQueue",
            Self::FocusWindow => "window.focus",
        }
    }
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

    /// Answer in the game's place with the same native function as its button.
    ///
    /// # Errors
    ///
    /// Fails when the SDK is unreachable or refuses the action, for example
    /// when nothing is pending any more.
    pub async fn perform(&self, action: GameAction) -> AppResult<()> {
        let method = action.method();
        let result: ActionResult = match action {
            GameAction::EnterBattlefield(index) | GameAction::LeaveBattlefield(index) => {
                self.rpc
                    .call_with(method, Some(IndexParams { index }))
                    .await?
            }
            _ => self.rpc.call(method).await?,
        };
        result.into_result(method)
    }

    /// Log in from the login screen with `client.login`. With a realm the call
    /// also selects it and returns on the character selection screen.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::SdkRpc`] with the SDK reason, for example
    /// `incorrect password`, when the login fails.
    pub async fn login(
        &self,
        username: &str,
        password: &Password,
        realm_list: Option<&str>,
        realm_name: Option<&str>,
    ) -> AppResult<()> {
        const METHOD: &str = "client.login";
        let params = LoginParams {
            username,
            password: password.expose(),
            realm_list,
            realm_name,
        };
        let result: ActionResult = self
            .rpc
            .call_with_timeout(METHOD, Some(params), LOGIN_TIMEOUT)
            .await?;
        result.into_result(METHOD)
    }

    /// Characters of the selected realm, read on the character selection screen.
    ///
    /// # Errors
    ///
    /// Fails when the SDK is unreachable or reports an error.
    pub async fn characters(&self) -> AppResult<Vec<SdkCharacter>> {
        let list: CharacterList = self.rpc.call("client.getCharacters").await?;
        Ok(list.characters)
    }

    /// Enter the world with a character and wait until it is loaded.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::SdkRpc`] with the SDK reason, for example
    /// `character not found`, when the character cannot enter the world.
    pub async fn enter_world(&self, name: &str) -> AppResult<()> {
        const METHOD: &str = "client.enterWorld";
        let result: ActionResult = self
            .rpc
            .call_with_timeout(
                METHOD,
                Some(EnterWorldParams { name, wait: true }),
                ENTER_WORLD_TIMEOUT,
            )
            .await?;
        result.into_result(METHOD)
    }

    /// Show the game window, ending a hidden start.
    ///
    /// # Errors
    ///
    /// Fails when the SDK is unreachable or reports an error.
    pub async fn show_window(&self) -> AppResult<()> {
        const METHOD: &str = "window.show";
        let result: ActionResult = self.rpc.call(METHOD).await?;
        result.into_result(METHOD)
    }

    /// Answer a whisper with `chat.reply` (SDK 2.2+), like pressing R in the
    /// game. Without `line_id` the last whisper received is answered.
    ///
    /// # Errors
    ///
    /// Fails when the SDK is unreachable or refuses the message, for example
    /// when the text is too long or the player is not in the world.
    pub async fn reply_whisper(&self, line_id: Option<u64>, text: &str) -> AppResult<()> {
        const METHOD: &str = "chat.reply";
        let result: ActionResult = self
            .rpc
            .call_with(METHOD, Some(ReplyParams { text, line_id }))
            .await?;
        result.into_result(METHOD)
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
        assert_eq!(world.map_area_id, 0);
        assert_eq!(world.instance, None);
        Ok(())
    }

    #[test]
    fn reads_characters_and_serializes_the_login() -> Result<(), serde_json::Error> {
        let list: CharacterList = serde_json::from_str(
            r#"{"count":1,"characters":[{"index":0,"name":"Jaina","level":80,"race":1,"class":8,"gender":1,"map":571,"zone":4395}]}"#,
        )?;
        assert_eq!(list.characters.len(), 1);
        assert_eq!(list.characters[0].name, "Jaina");
        assert_eq!(list.characters[0].class, 8);

        let password = Password::new("secret".to_owned());
        let params = LoginParams {
            username: "player",
            password: password.expose(),
            realm_list: None,
            realm_name: Some("Alpha"),
        };
        assert_eq!(
            serde_json::to_string(&params)?,
            r#"{"username":"player","password":"secret","realmName":"Alpha"}"#
        );
        Ok(())
    }

    #[test]
    fn reads_sdk_21_instance_and_group_size() -> Result<(), serde_json::Error> {
        let world: WorldState = serde_json::from_str(
            r#"{"mapId":631,"mapAreaId":605,"valid":true,
                "instance":{"inInstance":true,"type":"raid","mapName":"Icecrown Citadel",
                            "difficulty":3,"maxPlayers":10,"dynamic":true,"difficultyKey":"x"}}"#,
        )?;
        assert_eq!(world.map_area_id, 605);
        let instance = world.instance.unwrap_or_default();
        assert_eq!(instance.kind, "raid");
        assert_eq!((instance.difficulty, instance.max_players), (3, 10));

        let group: GroupState =
            serde_json::from_str(r#"{"valid":true,"type":"raid","memberCount":24,"size":25}"#)?;
        assert_eq!(group.size, Some(25));
        let old: GroupState =
            serde_json::from_str(r#"{"valid":true,"type":"party","memberCount":1}"#)?;
        assert_eq!(old.size, None);
        Ok(())
    }
}
