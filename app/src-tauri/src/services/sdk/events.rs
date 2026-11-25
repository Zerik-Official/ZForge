//! Events streamed by the SDK through the event pipe (newline-delimited JSON).

use std::io::ErrorKind;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::net::windows::named_pipe::NamedPipeClient;

use crate::error::{AppError, AppResult};
use crate::services::sdk::auth::SessionToken;
use crate::services::sdk::pipe::{self, EVENT_PIPE, PipeAccess};
use crate::services::sdk::social::SocialEvent;

/// Glue screen reported by `client.screenChanged`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientScreen {
    /// Not determined yet.
    Unknown,
    /// Login screen.
    Login,
    /// Character selection.
    CharacterSelect,
    /// Character creation (SDK 2.4+).
    CharacterCreate,
    /// Realm selection wizard shown before the first character (SDK 2.4+).
    RealmWizard,
    /// In the world.
    World,
}

impl ClientScreen {
    /// Screen from the code of `client.screenChanged`, or its name for screens without a code.
    fn from_code(code: i64, name: &str) -> Self {
        match code {
            1 => Self::Login,
            2 => Self::CharacterSelect,
            3 => Self::World,
            4 => Self::CharacterCreate,
            _ => Self::from_name(name, false),
        }
    }

    /// Screen from the name returned by `client.getScreen`.
    pub fn from_name(name: &str, in_world: bool) -> Self {
        if in_world {
            return Self::World;
        }
        match name {
            "login" => Self::Login,
            "charselect" => Self::CharacterSelect,
            "charcreate" => Self::CharacterCreate,
            "realmwizard" => Self::RealmWizard,
            _ => Self::Unknown,
        }
    }
}

/// Background image of a loading screen, from `LoadingScreens.dbc` (SDK 1.2+).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadingBackground {
    /// `LoadingScreens.dbc` row id.
    pub id: i64,
    /// Internal name, for example `Northrend`.
    pub name: String,
    /// `.blp` path, for example `Interface\Glues\LoadingScreens\LoadScreenNorthrend.blp`.
    pub file: String,
    /// Whether a `Wide` variant exists.
    #[serde(default)]
    pub has_wide_screen: bool,
}

/// An event received from the SDK.
#[derive(Debug, Clone, PartialEq)]
pub enum SdkEvent {
    /// The glue screen changed.
    ScreenChanged(ClientScreen),
    /// The realm list window opened (`true`) or closed (`false`) (SDK 2.4+).
    RealmList(bool),
    /// A loading screen appeared; map and background are only sent by SDK 1.2+.
    LoadingStarted {
        /// Map being loaded.
        map_id: Option<i64>,
        /// Background image, `None` when the generic one is used or unknown.
        background: Option<LoadingBackground>,
    },
    /// Loading progress between 0 and 1.
    LoadingProgress(f64),
    /// Loading finished and the world is entered.
    LoadingFinished,
    /// The loading screen closed without entering the world (SDK 1.2+).
    LoadingCancelled,
    /// The event pipe accepted the session token (SDK 2.0+).
    AuthAccepted,
    /// The event pipe rejected the session token (SDK 2.0+).
    AuthRejected(String),
    /// A social, trade, duel or queue event (SDK 2.1+).
    Social(SocialEvent),
    /// A subscribed WoW UI event; its arguments depend on the event.
    Game {
        /// WoW event name, for example `ZONE_CHANGED`.
        name: String,
        /// Raw event arguments.
        args: serde_json::Value,
    },
}

#[derive(Debug, Deserialize)]
struct WireEvent {
    event: String,
    #[serde(default)]
    args: serde_json::Value,
}

impl SdkEvent {
    /// Decode one event line; `None` for malformed lines.
    pub fn parse(line: &str) -> Option<Self> {
        let wire: WireEvent = serde_json::from_str(line).ok()?;
        let number = |key: &str| wire.args.get(key).and_then(serde_json::Value::as_f64);
        Some(match wire.event.as_str() {
            "client.screenChanged" => Self::ScreenChanged(ClientScreen::from_code(
                wire.args
                    .get("new")
                    .and_then(serde_json::Value::as_i64)
                    .unwrap_or(0),
                wire.args
                    .get("newName")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default(),
            )),
            "client.realmListOpened" => Self::RealmList(true),
            "client.realmListClosed" => Self::RealmList(false),
            "loading.startup" => Self::LoadingStarted {
                map_id: wire.args.get("mapId").and_then(serde_json::Value::as_i64),
                background: wire
                    .args
                    .get("background")
                    .and_then(|background| serde_json::from_value(background.clone()).ok()),
            },
            "loading.progress" => {
                Self::LoadingProgress(number("progress").unwrap_or(0.0).clamp(0.0, 1.0))
            }
            "loading.finished" => Self::LoadingFinished,
            "loading.cancelled" => Self::LoadingCancelled,
            "auth.ok" => Self::AuthAccepted,
            "auth.failed" => Self::AuthRejected(
                wire.args
                    .get("error")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_owned(),
            ),
            name => match SocialEvent::parse(name, &wire.args) {
                Some(social) => Self::Social(social),
                None => Self::Game {
                    name: wire.event,
                    args: wire.args,
                },
            },
        })
    }
}

/// `ERROR_PIPE_NOT_CONNECTED`: the game closed its end of the pipe.
const ERROR_PIPE_NOT_CONNECTED: i32 = 233;

/// Whether a read error only means the game closed the pipe (it exited).
fn is_disconnect(error: &std::io::Error) -> bool {
    error.kind() == ErrorKind::BrokenPipe || error.raw_os_error() == Some(ERROR_PIPE_NOT_CONNECTED)
}

/// An open connection to the event pipe.
#[derive(Debug)]
pub struct EventStream {
    lines: Lines<BufReader<NamedPipeClient>>,
}

impl EventStream {
    /// Connect to the event pipe, waiting up to `timeout` for the SDK to create
    /// it, and send the session token when there is one.
    ///
    /// SDK 2.0+ creates a duplex pipe and expects `{"auth":"<token>"}` first.
    /// Older SDKs create an outbound-only pipe: opening it for writing is denied,
    /// so the stream falls back to read-only without a handshake.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::SdkUnavailable`] when the pipe does not appear in time.
    pub async fn connect(timeout: Duration, token: Option<&SessionToken>) -> AppResult<Self> {
        let client = match pipe::open(EVENT_PIPE, PipeAccess::ReadWrite, timeout).await {
            Ok(mut client) => {
                if let Some(token) = token {
                    let mut handshake =
                        serde_json::to_vec(&serde_json::json!({ "auth": token.as_str() }))?;
                    handshake.push(b'\n');
                    client.write_all(&handshake).await?;
                }
                client
            }
            Err(AppError::Io(error)) if error.kind() == ErrorKind::PermissionDenied => {
                pipe::open(EVENT_PIPE, PipeAccess::ReadOnly, timeout).await?
            }
            Err(error) => return Err(error),
        };
        Ok(Self {
            lines: BufReader::new(client).lines(),
        })
    }

    /// Next event, or `None` when the game closed the pipe. Cancel-safe.
    ///
    /// # Errors
    ///
    /// Fails on unexpected I/O errors.
    pub async fn next(&mut self) -> AppResult<Option<SdkEvent>> {
        loop {
            let line = match self.lines.next_line().await {
                Ok(Some(line)) => line,
                Ok(None) => return Ok(None),
                Err(error) if is_disconnect(&error) => return Ok(None),
                Err(error) => return Err(error.into()),
            };
            match SdkEvent::parse(&line) {
                Some(SdkEvent::AuthAccepted) => {
                    tracing::debug!("SDK event pipe accepted the session token");
                    continue;
                }
                Some(SdkEvent::AuthRejected(reason)) => {
                    tracing::warn!(reason, "SDK event pipe rejected the session token");
                    return Err(AppError::SdkUnauthorized);
                }
                Some(event) => return Ok(Some(event)),
                None => {}
            }
            tracing::debug!(line, "Ignoring malformed SDK event");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sdk_and_game_events() {
        assert_eq!(
            SdkEvent::parse(
                r#"{"event":"client.screenChanged","args":{"old":1,"new":2},"time":1}"#
            ),
            Some(SdkEvent::ScreenChanged(ClientScreen::CharacterSelect))
        );
        assert_eq!(
            SdkEvent::parse(r#"{"event":"loading.progress","args":{"progress":1.5}}"#),
            Some(SdkEvent::LoadingProgress(1.0))
        );
        assert!(matches!(
            SdkEvent::parse(r#"{"event":"ZONE_CHANGED","args":[]}"#),
            Some(SdkEvent::Game { name, .. }) if name == "ZONE_CHANGED"
        ));
        assert_eq!(
            SdkEvent::parse(
                r#"{"event":"client.screenChanged","args":{"old":2,"new":4,"newName":"charcreate"}}"#
            ),
            Some(SdkEvent::ScreenChanged(ClientScreen::CharacterCreate))
        );
        assert_eq!(
            SdkEvent::parse(
                r#"{"event":"client.screenChanged","args":{"old":1,"new":0,"newName":"realmwizard"}}"#
            ),
            Some(SdkEvent::ScreenChanged(ClientScreen::RealmWizard))
        );
        assert_eq!(
            SdkEvent::parse(r#"{"event":"client.realmListOpened","args":{"realms":[]}}"#),
            Some(SdkEvent::RealmList(true))
        );
        assert_eq!(SdkEvent::parse("not json"), None);
    }

    #[test]
    fn parses_loading_screens_with_and_without_background() {
        let startup = r#"{"args":{"background":{"file":"Interface\\Glues\\LoadingScreens\\LoadScreenOutland.blp","hasWideScreen":true,"id":198,"name":"Outland"},"mapId":530},"event":"loading.startup","time":1}"#;
        let Some(SdkEvent::LoadingStarted { map_id, background }) = SdkEvent::parse(startup) else {
            unreachable!("startup must parse");
        };
        assert_eq!(map_id, Some(530));
        assert_eq!(
            background.map(|background| background.name),
            Some("Outland".to_owned())
        );

        assert_eq!(
            SdkEvent::parse(r#"{"args":{"background":null,"mapId":-1},"event":"loading.startup"}"#),
            Some(SdkEvent::LoadingStarted {
                map_id: Some(-1),
                background: None
            })
        );
        assert_eq!(
            SdkEvent::parse(r#"{"args":{},"event":"loading.startup"}"#),
            Some(SdkEvent::LoadingStarted {
                map_id: None,
                background: None
            })
        );
        assert_eq!(
            SdkEvent::parse(r#"{"args":{"mapId":0},"event":"loading.cancelled"}"#),
            Some(SdkEvent::LoadingCancelled)
        );
        assert_eq!(
            SdkEvent::parse(r#"{"args":{},"event":"auth.ok","time":1}"#),
            Some(SdkEvent::AuthAccepted)
        );
        assert_eq!(
            SdkEvent::parse(r#"{"args":{"error":"unauthorized"},"event":"auth.failed"}"#),
            Some(SdkEvent::AuthRejected("unauthorized".to_owned()))
        );
    }
}
