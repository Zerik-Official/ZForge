//! The running game session: a single source of truth about what the game is
//! doing, fed by the SDK event pipe and periodic state polling.
//!
//! Every change is published through a `watch` channel; the frontend and
//! Discord Rich Presence subscribe to it.

use std::process::Child;
use std::time::Duration;

use serde::Serialize;
use tokio::sync::watch;
use tokio::time::{MissedTickBehavior, interval};

use crate::domain::game::Game;
use crate::domain::{UnixMillis, now_millis};
use crate::error::{AppError, AppResult};
use crate::services::sdk::api::SdkApi;
use crate::services::sdk::events::{ClientScreen, EventStream, SdkEvent};
use crate::services::sdk::rpc::RpcClient;

/// Time allowed for the SDK to open its event pipe after launch.
const EVENT_PIPE_TIMEOUT: Duration = Duration::from_secs(90);

/// State refresh period while in the world.
const POLL_PERIOD: Duration = Duration::from_secs(5);

/// WoW UI events that trigger an immediate state refresh.
const WATCHED_EVENTS: &[&str] = &[
    "PLAYER_ENTERING_WORLD",
    "ZONE_CHANGED",
    "ZONE_CHANGED_INDOORS",
    "ZONE_CHANGED_NEW_AREA",
    "PLAYER_LEVEL_UP",
    "PLAYER_DEAD",
    "PLAYER_ALIVE",
    "PLAYER_UNGHOST",
    "PLAYER_REGEN_DISABLED",
    "PLAYER_REGEN_ENABLED",
    "PLAYER_FLAGS_CHANGED",
];

/// What the game is doing.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionPhase {
    /// No game is running.
    #[default]
    Idle,
    /// The game is starting.
    Launching,
    /// The game runs without the SDK; nothing more is known.
    Running,
    /// A loading screen is shown.
    Loading,
    /// Login screen.
    Login,
    /// Character selection.
    CharacterSelect,
    /// Playing in the world.
    InWorld,
}

/// How the game was started.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LaunchMode {
    /// Started directly; no live game data.
    Direct,
    /// Started through `WowInjector.exe` with the SDK.
    Sdk,
}

/// The character being played.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CharacterInfo {
    /// Character name.
    pub name: String,
    /// Level.
    pub level: u32,
    /// Race id.
    pub race_id: u32,
    /// Class id.
    pub class_id: u32,
}

/// Where the character is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LocationInfo {
    /// Map or instance id.
    pub map_id: u32,
    /// Zone id.
    pub zone_id: u32,
    /// Localized zone name.
    pub zone: String,
    /// Localized sub-zone name.
    pub sub_zone: String,
}

/// Character flags shown in Rich Presence.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct PlayerStatus {
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
}

/// Everything known about the current session.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct SessionSnapshot {
    /// Current phase.
    pub phase: SessionPhase,
    /// How the game was started.
    pub mode: Option<LaunchMode>,
    /// Identifier of the running game.
    pub game_id: Option<String>,
    /// Expansion key of the running game.
    pub expansion: Option<String>,
    /// Session start time.
    pub started_at: Option<UnixMillis>,
    /// Loading progress (0–1) while a loading screen is shown.
    pub loading_progress: Option<f64>,
    /// Character, once in the world.
    pub character: Option<CharacterInfo>,
    /// Location, once in the world.
    pub location: Option<LocationInfo>,
    /// Character flags, once in the world.
    pub status: Option<PlayerStatus>,
    /// The SDK event pipe is connected.
    pub sdk_connected: bool,
    /// Error code of the last session that failed to start.
    pub last_error: Option<String>,
}

impl SessionSnapshot {
    /// Whether a game is running or starting.
    pub fn is_active(&self) -> bool {
        self.phase != SessionPhase::Idle
    }

    fn clear_world(&mut self) {
        self.character = None;
        self.location = None;
        self.status = None;
    }

    /// Apply an SDK event; returns whether the world state should be refreshed.
    fn apply(&mut self, event: &SdkEvent) -> bool {
        match event {
            SdkEvent::ScreenChanged(ClientScreen::Login) => {
                self.phase = SessionPhase::Login;
                self.loading_progress = None;
                self.clear_world();
                false
            }
            SdkEvent::ScreenChanged(ClientScreen::CharacterSelect) => {
                self.phase = SessionPhase::CharacterSelect;
                self.loading_progress = None;
                self.clear_world();
                false
            }
            SdkEvent::ScreenChanged(ClientScreen::World) | SdkEvent::LoadingFinished => {
                self.phase = SessionPhase::InWorld;
                self.loading_progress = None;
                true
            }
            SdkEvent::ScreenChanged(ClientScreen::Unknown) => false,
            SdkEvent::LoadingStarted => {
                self.phase = SessionPhase::Loading;
                self.loading_progress = Some(0.0);
                false
            }
            SdkEvent::LoadingProgress(progress) => {
                if self.phase == SessionPhase::Loading {
                    self.loading_progress = Some((progress * 100.0).round() / 100.0);
                }
                false
            }
            SdkEvent::Game { .. } => self.phase == SessionPhase::InWorld,
        }
    }
}

/// Owner of the session state.
#[derive(Debug)]
pub struct GameSession {
    state: watch::Sender<SessionSnapshot>,
    rpc: RpcClient,
}

impl Default for GameSession {
    fn default() -> Self {
        Self::new()
    }
}

impl GameSession {
    /// Idle session.
    pub fn new() -> Self {
        Self {
            state: watch::Sender::new(SessionSnapshot::default()),
            rpc: RpcClient::default(),
        }
    }

    /// Current snapshot.
    pub fn snapshot(&self) -> SessionSnapshot {
        self.state.borrow().clone()
    }

    /// Receive every future change.
    pub fn subscribe(&self) -> watch::Receiver<SessionSnapshot> {
        self.state.subscribe()
    }

    fn update(&self, change: impl FnOnce(&mut SessionSnapshot)) {
        self.state.send_if_modified(|snapshot| {
            let before = snapshot.clone();
            change(snapshot);
            *snapshot != before
        });
    }

    /// Mark a game as launching.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::GameAlreadyRunning`] when a session is active.
    pub fn begin(&self, game: &Game, mode: LaunchMode) -> AppResult<()> {
        let mut started = false;
        self.state.send_if_modified(|snapshot| {
            if snapshot.is_active() {
                return false;
            }
            *snapshot = SessionSnapshot {
                phase: SessionPhase::Launching,
                mode: Some(mode),
                game_id: Some(game.id.clone()),
                expansion: Some(game.expansion.clone()),
                started_at: Some(now_millis()),
                ..SessionSnapshot::default()
            };
            started = true;
            true
        });
        if started {
            Ok(())
        } else {
            Err(AppError::GameAlreadyRunning)
        }
    }

    /// End the session, recording the error that stopped it, if any.
    pub fn finish(&self, error: Option<&AppError>) {
        if let Some(error) = error {
            tracing::warn!(%error, "Game session ended with an error");
        } else {
            tracing::info!("Game session ended");
        }
        self.update(|snapshot| {
            *snapshot = SessionSnapshot {
                last_error: error.map(|error| error.code().to_owned()),
                ..SessionSnapshot::default()
            };
        });
    }

    /// Track a directly launched game until its process exits.
    pub async fn run_direct(&self, mut child: Child) {
        self.update(|snapshot| snapshot.phase = SessionPhase::Running);
        let exit = tauri::async_runtime::spawn_blocking(move || child.wait()).await;
        match exit {
            Ok(Ok(status)) => {
                tracing::info!(%status, "Game process exited");
                self.finish(None);
            }
            Ok(Err(error)) => self.finish(Some(&error.into())),
            Err(error) => self.finish(Some(&AppError::BackgroundTask(error.to_string()))),
        }
    }

    /// Follow a game launched with the SDK until the game closes the event pipe.
    pub async fn run_sdk(&self) {
        let mut stream = match EventStream::connect(EVENT_PIPE_TIMEOUT).await {
            Ok(stream) => stream,
            Err(error) => {
                self.finish(Some(&error));
                return;
            }
        };
        self.update(|snapshot| snapshot.sdk_connected = true);
        let api = SdkApi::new(&self.rpc);
        if let Err(error) = api.subscribe(WATCHED_EVENTS).await {
            tracing::warn!(%error, "Could not subscribe to game events");
        }
        self.sync_screen(&api).await;

        let mut poll = interval(POLL_PERIOD);
        poll.set_missed_tick_behavior(MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                event = stream.next() => match event {
                    Ok(Some(event)) => {
                        let mut refresh = false;
                        self.update(|snapshot| refresh = snapshot.apply(&event));
                        if refresh {
                            self.refresh(&api).await;
                        }
                    }
                    Ok(None) => break,
                    Err(error) => {
                        tracing::warn!(%error, "SDK event stream failed");
                        break;
                    }
                },
                _ = poll.tick() => {
                    if self.state.borrow().phase == SessionPhase::InWorld {
                        self.refresh(&api).await;
                    }
                }
            }
        }
        self.finish(None);
    }

    /// Set the phase from the current glue screen (the event stream only reports changes).
    async fn sync_screen(&self, api: &SdkApi<'_>) {
        match api.screen().await {
            Ok(screen) => {
                let event = SdkEvent::ScreenChanged(ClientScreen::from_name(
                    &screen.screen,
                    screen.in_world,
                ));
                let mut refresh = false;
                self.update(|snapshot| refresh = snapshot.apply(&event));
                if refresh {
                    self.refresh(api).await;
                }
            }
            Err(error) => tracing::debug!(%error, "Could not read the current screen"),
        }
    }

    /// Read the character, location and flags from the SDK.
    async fn refresh(&self, api: &SdkApi<'_>) {
        let player = api.player_state().await;
        let world = api.world_state().await;
        let unit = api.unit("player").await;
        self.update(|snapshot| {
            if snapshot.phase != SessionPhase::InWorld {
                return;
            }
            if let Ok(player) = &player
                && player.valid
            {
                snapshot.status = Some(PlayerStatus {
                    in_combat: player.in_combat,
                    dead: player.dead,
                    ghost: player.ghost,
                    mounted: player.mounted,
                    flying: player.flying,
                    swimming: player.swimming,
                    afk: player.afk,
                    dnd: player.dnd,
                });
                let name = match &unit {
                    Ok(unit) if unit.exists && !unit.name.is_empty() => unit.name.clone(),
                    _ => snapshot
                        .character
                        .as_ref()
                        .map(|character| character.name.clone())
                        .unwrap_or_default(),
                };
                snapshot.character = Some(CharacterInfo {
                    name,
                    level: player.level,
                    race_id: player.race,
                    class_id: player.class,
                });
            }
            if let Ok(world) = &world
                && world.valid
                && !world.loading
            {
                snapshot.location = Some(LocationInfo {
                    map_id: world.map_id,
                    zone_id: world.zone_id,
                    zone: world.zone_name.clone(),
                    sub_zone: world.sub_zone_name.clone(),
                });
            }
        });
        for error in [player.err(), world.err(), unit.err()]
            .into_iter()
            .flatten()
        {
            tracing::debug!(%error, "SDK state refresh incomplete");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game() -> Game {
        Game {
            id: "g1".to_owned(),
            name: "WoW".to_owned(),
            expansion: "wotlk".to_owned(),
            exe_path: String::new(),
            bg_video: String::new(),
            icon: String::new(),
            poster: String::new(),
            box_art: String::new(),
            show_on_main: true,
            created_at: 0,
            sort_order: 0,
        }
    }

    #[test]
    fn follows_screen_and_loading_events() {
        let mut snapshot = SessionSnapshot {
            phase: SessionPhase::Launching,
            ..SessionSnapshot::default()
        };
        assert!(!snapshot.apply(&SdkEvent::ScreenChanged(ClientScreen::Login)));
        assert_eq!(snapshot.phase, SessionPhase::Login);

        snapshot.apply(&SdkEvent::LoadingStarted);
        snapshot.apply(&SdkEvent::LoadingProgress(0.456));
        assert_eq!(snapshot.loading_progress, Some(0.46));

        assert!(snapshot.apply(&SdkEvent::LoadingFinished));
        assert_eq!(snapshot.phase, SessionPhase::InWorld);
        assert_eq!(snapshot.loading_progress, None);

        let zone_change = SdkEvent::Game {
            name: "ZONE_CHANGED".to_owned(),
            args: serde_json::Value::Null,
        };
        assert!(snapshot.apply(&zone_change));
    }

    #[test]
    fn allows_one_session_at_a_time() -> AppResult<()> {
        let session = GameSession::new();
        let changes = session.subscribe();
        session.begin(&game(), LaunchMode::Direct)?;
        assert!(changes.has_changed().unwrap_or(false));
        assert!(matches!(
            session.begin(&game(), LaunchMode::Sdk),
            Err(AppError::GameAlreadyRunning)
        ));

        session.finish(Some(&AppError::SdkUnavailable));
        let snapshot = session.snapshot();
        assert!(!snapshot.is_active());
        assert_eq!(snapshot.last_error.as_deref(), Some("sdk_unavailable"));
        session.begin(&game(), LaunchMode::Sdk)?;
        assert_eq!(session.snapshot().mode, Some(LaunchMode::Sdk));
        Ok(())
    }
}
