//! Social, trade, duel and queue events pushed by SDK 2.1.

use serde::Deserialize;
use serde::de::DeserializeOwned;

/// Race, gender and class of the other player of a social event (SDK 2.4+).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SocialPlayer {
    /// Race id.
    pub race: u32,
    /// `0` male, `1` female.
    pub gender: u32,
    /// Class id.
    pub class_id: u32,
}

/// A friend from `friends.online` or `friends.offline`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct FriendEvent {
    /// Character name.
    pub name: String,
    /// Level, `0` when offline.
    pub level: u32,
    /// Localized class name.
    pub class_name: String,
    /// Localized zone name.
    pub area_name: String,
    /// Race, gender and class of the other player (SDK 2.4+).
    pub player: Option<SocialPlayer>,
}

/// A whisper from `chat.whisperReceived`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct WhisperEvent {
    /// Sender name.
    pub author: String,
    /// Message text.
    pub text: String,
    /// Whether it is a Battle.net whisper.
    pub battle_net: bool,
    /// Chat line id, used to answer this whisper with `chat.reply`; `0` when unknown.
    pub line_id: u64,
    /// Race, gender and class of the other player (SDK 2.4+).
    pub player: Option<SocialPlayer>,
}

/// A group invitation from `group.inviteReceived`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct InviteEvent {
    /// Player who sent the invitation.
    pub inviter_name: String,
    /// Race, gender and class of the other player (SDK 2.4+).
    pub player: Option<SocialPlayer>,
}

/// A summon from `summon.requested`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SummonEvent {
    /// Player who summons.
    pub summoner_name: String,
    /// Localized destination.
    pub area_name: String,
    /// Race, gender and class of the other player (SDK 2.4+).
    pub player: Option<SocialPlayer>,
}

/// Dungeon of a Dungeon Finder proposal.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProposalDungeon {
    /// Localized dungeon name.
    pub name: String,
}

/// A Dungeon Finder proposal from `lfg.proposalShown`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProposalEvent {
    /// Whether the proposal exists.
    pub exists: bool,
    /// Proposed dungeon.
    pub dungeon: ProposalDungeon,
    /// Role assigned to the player: `TANK`, `HEALER`, `DAMAGER` or `UNKNOWN`.
    pub role: String,
}

/// A trade request from `trade.requested`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TradeRequestEvent {
    /// Player who wants to trade.
    pub requester_name: String,
    /// Race, gender and class of the other player (SDK 2.4+).
    pub player: Option<SocialPlayer>,
}

/// An open trade window from `trade.opened`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TradeOpenedEvent {
    /// Player on the other side of the trade.
    pub trader_name: String,
    /// Race, gender and class of the other player (SDK 2.4+).
    pub player: Option<SocialPlayer>,
}

/// A duel request from `duel.requested`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DuelEvent {
    /// Player who sent the challenge.
    pub challenger_name: String,
    /// Race, gender and class of the other player (SDK 2.4+).
    pub player: Option<SocialPlayer>,
}

/// A battleground or arena invitation from `battlefield.ready`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct BattlefieldEvent {
    /// Queue slot, `1` or `2`.
    pub index: u32,
    /// Localized map name.
    pub map_name: String,
    /// Arena queue.
    pub arena: bool,
    /// Rated match.
    pub rated: bool,
    /// Arena team size, `0` for battlegrounds.
    pub team_size: u32,
    /// Whether the invitation can be declined (arena invitations cannot).
    pub can_leave: bool,
}

/// An SDK 2.1 event the launcher can notify about.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SocialEvent {
    /// A friend connected.
    FriendOnline(FriendEvent),
    /// A friend disconnected.
    FriendOffline(FriendEvent),
    /// A whisper arrived.
    Whisper(WhisperEvent),
    /// Someone invited the player to a group.
    InviteReceived(InviteEvent),
    /// The group invitation ended.
    InviteClosed,
    /// Someone summons the player.
    SummonRequested(SummonEvent),
    /// The summon was answered or cancelled.
    SummonClosed,
    /// The Dungeon Finder found a group.
    ProposalShown(ProposalEvent),
    /// The Dungeon Finder proposal ended.
    ProposalClosed,
    /// Someone wants to trade.
    TradeRequested(TradeRequestEvent),
    /// The trade request ended.
    TradeRequestClosed,
    /// A trade window opened; in 3.3.5a the other player usually opens it without a request.
    TradeOpened(TradeOpenedEvent),
    /// Someone challenged the player to a duel.
    DuelRequested(DuelEvent),
    /// The duel request or the duel ended.
    DuelClosed,
    /// A battleground or arena is ready to enter.
    BattlefieldReady(BattlefieldEvent),
}

fn payload<T: DeserializeOwned + Default>(args: &serde_json::Value) -> T {
    serde_json::from_value(args.clone()).unwrap_or_default()
}

impl SocialEvent {
    /// Race, gender and class of the other player of the event, when the SDK sent them.
    pub fn player(&self) -> Option<SocialPlayer> {
        match self {
            Self::FriendOnline(friend) | Self::FriendOffline(friend) => friend.player,
            Self::Whisper(whisper) => whisper.player,
            Self::InviteReceived(invite) => invite.player,
            Self::SummonRequested(summon) => summon.player,
            Self::TradeRequested(request) => request.player,
            Self::TradeOpened(trade) => trade.player,
            Self::DuelRequested(duel) => duel.player,
            _ => None,
        }
    }

    /// Decode an SDK event by name; `None` when it is not a social event.
    pub fn parse(name: &str, args: &serde_json::Value) -> Option<Self> {
        Some(match name {
            "friends.online" => Self::FriendOnline(payload(args)),
            "friends.offline" => Self::FriendOffline(payload(args)),
            "chat.whisperReceived" => Self::Whisper(payload(args)),
            "group.inviteReceived" => Self::InviteReceived(payload(args)),
            "group.inviteClosed" => Self::InviteClosed,
            "summon.requested" => Self::SummonRequested(payload(args)),
            "summon.closed" => Self::SummonClosed,
            "lfg.proposalShown" => Self::ProposalShown(payload(args)),
            "lfg.proposalFailed" | "lfg.proposalSucceeded" => Self::ProposalClosed,
            "trade.requested" => Self::TradeRequested(payload(args)),
            "trade.requestClosed" => Self::TradeRequestClosed,
            "trade.opened" => Self::TradeOpened(payload(args)),
            "duel.requested" => Self::DuelRequested(payload(args)),
            "duel.accepted" | "duel.closed" => Self::DuelClosed,
            "battlefield.ready" => Self::BattlefieldReady(payload(args)),
            _ => return None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_social_events_and_ignores_others() -> Result<(), serde_json::Error> {
        let friend = serde_json::from_str(
            r#"{"name":"Jaina","level":80,"className":"Mage","areaName":"Dalaran","online":true}"#,
        )?;
        assert_eq!(
            SocialEvent::parse("friends.online", &friend),
            Some(SocialEvent::FriendOnline(FriendEvent {
                player: None,
                name: "Jaina".to_owned(),
                level: 80,
                class_name: "Mage".to_owned(),
                area_name: "Dalaran".to_owned(),
            }))
        );

        let whisper = serde_json::from_str(
            r#"{"author":"Thrall","text":"hola","battleNet":false,"lineId":42,"guid":"0x1","args":[]}"#,
        )?;
        assert_eq!(
            SocialEvent::parse("chat.whisperReceived", &whisper),
            Some(SocialEvent::Whisper(WhisperEvent {
                player: None,
                author: "Thrall".to_owned(),
                text: "hola".to_owned(),
                battle_net: false,
                line_id: 42,
            }))
        );

        let ready = serde_json::from_str(
            r#"{"index":2,"mapName":"Warsong Gulch","arena":false,"canLeave":true,"status":"confirm"}"#,
        )?;
        let parsed = SocialEvent::parse("battlefield.ready", &ready);
        assert!(matches!(
            parsed,
            Some(SocialEvent::BattlefieldReady(BattlefieldEvent {
                index: 2,
                can_leave: true,
                ..
            }))
        ));

        assert_eq!(
            SocialEvent::parse("group.inviteReceived", &serde_json::Value::Null),
            Some(SocialEvent::InviteReceived(InviteEvent::default()))
        );
        assert_eq!(
            SocialEvent::parse("UNIT_HEALTH", &serde_json::Value::Null),
            None
        );
        Ok(())
    }
}
