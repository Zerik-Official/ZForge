//! The running game session: a single source of truth about what the game is
//! doing, fed by the SDK event pipe and periodic state polling.
//!
//! Every change is published through a `watch` channel; the frontend and
//! Discord Rich Presence subscribe to it.

use std::process::Child;
use std::time::Duration;

use serde::Serialize;
use tokio::sync::watch;
use tokio::time::{Instant, MissedTickBehavior, interval};

use crate::domain::game::Game;
use crate::domain::{UnixMillis, now_millis};
use crate::error::{AppError, AppResult};
use crate::services::sdk::api::SdkApi;
use crate::services::sdk::events::{ClientScreen, EventStream, LoadingBackground, SdkEvent};
use crate::services::sdk::rpc::RpcClient;

/// Time allowed for the SDK to open its event pipe after launch.
const EVENT_PIPE_TIMEOUT: Duration = Duration::from_secs(90);

/// Tick of the background checks.
const TICK: Duration = Duration::from_secs(1);

/// State refresh period while in the world, in ticks.
const REFRESH_EVERY_TICKS: u32 = 5;

/// A loading screen without progress for this long was abandoned. SDK
/// versions before 1.2 report a loading on logout and drop it after 5 s
/// without emitting `loading.cancelled`.
const LOADING_STALL: Duration = Duration::from_secs(6);

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

/// The loading screen being shown.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LoadingScreenInfo {
    /// Map being loaded (SDK 1.2+).
    pub map_id: Option<i64>,
    /// Background image; `None` for the generic image or older SDKs.
    pub background: Option<LoadingBackground>,
}

/// What the session loop must do after applying an event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FollowUp {
    /// Nothing.
    None,
    /// Read the character, location and flags.
    Refresh,
    /// Ask the SDK which screen is shown.
    SyncScreen,
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
    /// Loading screen details while it is shown.
    pub loading_screen: Option<LoadingScreenInfo>,
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

    fn clear_loading(&mut self) {
        self.loading_progress = None;
        self.loading_screen = None;
    }

    /// Show a screen reported by the SDK, ending any loading screen.
    fn enter_screen(&mut self, screen: ClientScreen) -> FollowUp {
        match screen {
            ClientScreen::Login | ClientScreen::CharacterSelect => {
                self.phase = if screen == ClientScreen::Login {
                    SessionPhase::Login
                } else {
                    SessionPhase::CharacterSelect
                };
                self.clear_loading();
                self.clear_world();
                FollowUp::None
            }
            ClientScreen::World => {
                self.phase = SessionPhase::InWorld;
                self.clear_loading();
                FollowUp::Refresh
            }
            ClientScreen::Unknown => FollowUp::None,
        }
    }

    /// Apply an SDK event.
    ///
    /// While a loading screen is shown, changes to the login or character
    /// screens are ignored: the SDK reports them late, often after
    /// `loading.startup`, and every loading ends with `loading.finished` or
    /// `loading.cancelled`.
    fn apply(&mut self, event: &SdkEvent) -> FollowUp {
        match event {
            SdkEvent::ScreenChanged(ClientScreen::Login | ClientScreen::CharacterSelect)
                if self.phase == SessionPhase::Loading =>
            {
                FollowUp::None
            }
            SdkEvent::ScreenChanged(screen) => self.enter_screen(*screen),
            SdkEvent::LoadingFinished => self.enter_screen(ClientScreen::World),
            SdkEvent::LoadingStarted { map_id, background } => {
                self.phase = SessionPhase::Loading;
                self.loading_progress = Some(0.0);
                self.loading_screen = Some(LoadingScreenInfo {
                    map_id: *map_id,
                    background: background.clone(),
                });
                FollowUp::None
            }
            SdkEvent::LoadingProgress(progress) => {
                if self.phase == SessionPhase::Loading {
                    self.loading_progress = Some((progress * 100.0).round() / 100.0);
                }
                FollowUp::None
            }
            SdkEvent::LoadingCancelled => {
                if self.phase == SessionPhase::Loading {
                    self.clear_loading();
                    FollowUp::SyncScreen
                } else {
                    FollowUp::None
                }
            }
            SdkEvent::Game { .. } if self.phase == SessionPhase::InWorld => FollowUp::Refresh,
            SdkEvent::Game { .. } => FollowUp::None,
        }
    }
}

/// Detects loading screens abandoned without `loading.cancelled` (SDK < 1.2).
#[derive(Debug, Default)]
struct StallDetector {
    loading_started: Option<Instant>,
    progress_events: u32,
}

impl StallDetector {
    fn observe(&mut self, event: &SdkEvent, now: Instant) {
        match event {
            SdkEvent::LoadingStarted { .. } => {
                self.loading_started = Some(now);
                self.progress_events = 0;
            }
            SdkEvent::LoadingProgress(_) => self.progress_events += 1,
            SdkEvent::LoadingFinished
            | SdkEvent::LoadingCancelled
            | SdkEvent::ScreenChanged(ClientScreen::World) => self.loading_started = None,
            _ => {}
        }
    }

    /// Whether the current loading never progressed and was likely abandoned.
    fn take_stalled(&mut self, now: Instant) -> bool {
        let stalled = self.progress_events <= 1
            && self
                .loading_started
                .is_some_and(|started| now.duration_since(started) >= LOADING_STALL);
        if stalled {
            self.loading_started = None;
        }
        stalled
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

        let mut stalls = StallDetector::default();
        let mut ticks: u32 = 0;
        let mut tick = interval(TICK);
        tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                event = stream.next() => match event {
                    Ok(Some(event)) => {
                        stalls.observe(&event, Instant::now());
                        let mut follow_up = FollowUp::None;
                        self.update(|snapshot| follow_up = snapshot.apply(&event));
                        self.follow_up(&api, follow_up).await;
                    }
                    Ok(None) => break,
                    Err(error) => {
                        tracing::warn!(%error, "SDK event stream failed");
                        break;
                    }
                },
                _ = tick.tick() => {
                    ticks = ticks.wrapping_add(1);
                    let phase = self.state.borrow().phase;
                    if phase == SessionPhase::Loading && stalls.take_stalled(Instant::now()) {
                        tracing::debug!("Loading never progressed; reading the current screen");
                        self.sync_screen(&api).await;
                    } else if phase == SessionPhase::InWorld && ticks.is_multiple_of(REFRESH_EVERY_TICKS) {
                        self.refresh(&api).await;
                    }
                }
            }
        }
        self.finish(None);
    }

    async fn follow_up(&self, api: &SdkApi<'_>, follow_up: FollowUp) {
        match follow_up {
            FollowUp::None => {}
            FollowUp::Refresh => self.refresh(api).await,
            FollowUp::SyncScreen => self.sync_screen(api).await,
        }
    }

    /// Set the phase from the screen the SDK reports now, ending any loading
    /// screen (the event stream only reports changes).
    async fn sync_screen(&self, api: &SdkApi<'_>) {
        match api.screen().await {
            Ok(screen) => {
                let screen = ClientScreen::from_name(&screen.screen, screen.in_world);
                let mut follow_up = FollowUp::None;
                self.update(|snapshot| follow_up = snapshot.enter_screen(screen));
                if follow_up == FollowUp::Refresh {
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

    fn started(map_id: i64) -> SdkEvent {
        SdkEvent::LoadingStarted {
            map_id: Some(map_id),
            background: Some(LoadingBackground {
                id: 198,
                name: "Outland".to_owned(),
                file: r"Interface\Glues\LoadingScreens\LoadScreenOutland.blp".to_owned(),
                has_wide_screen: true,
            }),
        }
    }

    #[test]
    fn follows_screen_and_loading_events() {
        let mut snapshot = SessionSnapshot {
            phase: SessionPhase::Launching,
            ..SessionSnapshot::default()
        };
        assert_eq!(
            snapshot.apply(&SdkEvent::ScreenChanged(ClientScreen::Login)),
            FollowUp::None
        );
        assert_eq!(snapshot.phase, SessionPhase::Login);

        snapshot.apply(&started(530));
        snapshot.apply(&SdkEvent::LoadingProgress(0.456));
        assert_eq!(snapshot.loading_progress, Some(0.46));
        assert_eq!(
            snapshot
                .loading_screen
                .as_ref()
                .and_then(|screen| screen.map_id),
            Some(530)
        );

        assert_eq!(
            snapshot.apply(&SdkEvent::LoadingFinished),
            FollowUp::Refresh
        );
        assert_eq!(snapshot.phase, SessionPhase::InWorld);
        assert_eq!(snapshot.loading_progress, None);
        assert_eq!(snapshot.loading_screen, None);

        let zone_change = SdkEvent::Game {
            name: "ZONE_CHANGED".to_owned(),
            args: serde_json::Value::Null,
        };
        assert_eq!(snapshot.apply(&zone_change), FollowUp::Refresh);
    }

    #[test]
    fn keeps_loading_when_the_screen_change_arrives_late() {
        let mut snapshot = SessionSnapshot {
            phase: SessionPhase::InWorld,
            ..SessionSnapshot::default()
        };
        snapshot.apply(&started(1));
        snapshot.apply(&SdkEvent::ScreenChanged(ClientScreen::CharacterSelect));
        assert_eq!(snapshot.phase, SessionPhase::Loading);
        snapshot.apply(&SdkEvent::ScreenChanged(ClientScreen::World));
        assert_eq!(snapshot.phase, SessionPhase::InWorld);
    }

    #[test]
    fn cancelled_loadings_resync_the_screen() {
        let mut snapshot = SessionSnapshot::default();
        snapshot.apply(&started(0));
        assert_eq!(
            snapshot.apply(&SdkEvent::LoadingCancelled),
            FollowUp::SyncScreen
        );
        assert_eq!(snapshot.loading_screen, None);
        assert_eq!(
            snapshot.enter_screen(ClientScreen::CharacterSelect),
            FollowUp::None
        );
        assert_eq!(snapshot.phase, SessionPhase::CharacterSelect);
    }

    #[test]
    fn detects_loadings_abandoned_by_old_sdks() {
        let start = Instant::now();
        let mut stalls = StallDetector::default();
        stalls.observe(
            &SdkEvent::LoadingStarted {
                map_id: None,
                background: None,
            },
            start,
        );
        stalls.observe(&SdkEvent::LoadingProgress(0.0), start);
        assert!(!stalls.take_stalled(start + Duration::from_secs(3)));
        assert!(stalls.take_stalled(start + LOADING_STALL));
        assert!(!stalls.take_stalled(start + LOADING_STALL));

        stalls.observe(&started(0), start);
        for _ in 0..5 {
            stalls.observe(&SdkEvent::LoadingProgress(0.5), start);
        }
        assert!(!stalls.take_stalled(start + Duration::from_secs(30)));
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
