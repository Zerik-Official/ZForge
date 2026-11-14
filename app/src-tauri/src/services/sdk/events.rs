//! Events streamed by the SDK through the event pipe (newline-delimited JSON).

use std::io::ErrorKind;
use std::time::Duration;

use serde::Deserialize;
use tokio::io::{AsyncBufReadExt, BufReader, Lines};
use tokio::net::windows::named_pipe::NamedPipeClient;

use crate::error::AppResult;
use crate::services::sdk::pipe::{self, EVENT_PIPE, PipeAccess};

/// Glue screen reported by `client.screenChanged`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientScreen {
    /// Not determined yet.
    Unknown,
    /// Login screen.
    Login,
    /// Character selection.
    CharacterSelect,
    /// In the world.
    World,
}

impl ClientScreen {
    fn from_code(code: i64) -> Self {
        match code {
            1 => Self::Login,
            2 => Self::CharacterSelect,
            3 => Self::World,
            _ => Self::Unknown,
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
            _ => Self::Unknown,
        }
    }
}

/// An event received from the SDK.
#[derive(Debug, Clone, PartialEq)]
pub enum SdkEvent {
    /// The glue screen changed.
    ScreenChanged(ClientScreen),
    /// A loading screen appeared.
    LoadingStarted,
    /// Loading progress between 0 and 1.
    LoadingProgress(f64),
    /// Loading finished and the world is entered.
    LoadingFinished,
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
            )),
            "loading.startup" => Self::LoadingStarted,
            "loading.progress" => {
                Self::LoadingProgress(number("progress").unwrap_or(0.0).clamp(0.0, 1.0))
            }
            "loading.finished" => Self::LoadingFinished,
            _ => Self::Game {
                name: wire.event,
                args: wire.args,
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
    /// Connect to the event pipe, waiting up to `timeout` for the SDK to create it.
    ///
    /// # Errors
    ///
    /// Returns [`crate::error::AppError::SdkUnavailable`] when the pipe does not appear in time.
    pub async fn connect(timeout: Duration) -> AppResult<Self> {
        let client = pipe::open(EVENT_PIPE, PipeAccess::ReadOnly, timeout).await?;
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
            if let Some(event) = SdkEvent::parse(&line) {
                return Ok(Some(event));
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
        assert_eq!(SdkEvent::parse("not json"), None);
    }
}
