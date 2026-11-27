//! The running game session: a single source of truth about what the game is
//! doing, fed by the SDK event pipe and periodic state polling.
//!
//! Every change is published through a `watch` channel; the frontend and
//! Discord Rich Presence subscribe to it.

use std::process::Child;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::Duration;

use serde::Serialize;
use tokio::sync::{broadcast, watch};
use tokio::time::{Instant, MissedTickBehavior, interval, sleep_until};

use crate::domain::game::Game;
use crate::domain::{UnixMillis, now_millis};
use crate::error::{AppError, AppResult};
use crate::services::credentials::Password;
use crate::services::sdk::api::{SdkApi, SdkCharacter};
use crate::services::sdk::auth::SessionToken;
use crate::services::sdk::events::{ClientScreen, EventStream, LoadingBackground, SdkEvent};
use crate::services::sdk::rpc::RpcClient;
use crate::services::sdk::social::SocialEvent;

/// Time allowed for the SDK to open its event pipe after launch.
const EVENT_PIPE_TIMEOUT: Duration = Duration::from_secs(90);

/// Tick of the background checks.
const TICK: Duration = Duration::from_secs(1);

/// State refresh period while in the world, in ticks.
const REFRESH_EVERY_TICKS: u32 = 5;

/// Wait before reading the world again while the client has not placed the character yet.
const AREA_RETRY_DELAY: Duration = Duration::from_millis(400);

/// Reads that may wait for the zone after a loading screen before it is shown without one.
const AREA_RETRIES: u8 = 8;

/// Wait after a game event before reading the state, so a burst is read once.
const EVENT_REFRESH_DELAY: Duration = Duration::from_millis(250);

/// A loading screen without progress for this long was abandoned. SDK
/// versions before 1.2 report a loading on logout and drop it after 5 s
/// without emitting `loading.cancelled`.
const LOADING_STALL: Duration = Duration::from_secs(6);

/// Time allowed for the client to reach the login screen after launch.
const LOGIN_SCREEN_TIMEOUT: Duration = Duration::from_secs(180);

/// Time allowed for the character selection screen after logging in.
const CHARACTER_SELECT_TIMEOUT: Duration = Duration::from_secs(30);

/// Attempts to read a character list that is still empty after logging in.
const CHARACTER_LIST_ATTEMPTS: u32 = 5;

/// Pause between attempts to read the character list.
const CHARACTER_LIST_RETRY: Duration = Duration::from_millis(400);

/// Login and character errors reported by the SDK that the frontend translates.
const LOGIN_ERROR_CODES: &[&str] = &[
    "not_on_login_screen",
    "login_screen_not_ready",
    "username_and_password_required",
    "login_failed",
    "server_down",
    "unknown_account",
    "incorrect_password",
    "disconnected",
    "parental_control",
    "chargeback",
    "conversion_required",
    "account_banned",
    "account_suspended",
    "account_locked",
    "game_account_locked",
    "unlockable_lock",
    "already_online",
    "bad_version",
    "no_time_remaining",
    "database_busy",
    "trial_expired",
    "account_converted",
    "login_timeout",
    "realm_list_timeout",
    "realm_select_timeout",
    "not_on_character_select_screen",
    "character_not_found",
    "enter_world_timeout",
    "returned_to_character_list",
];

/// SDK reasons whose code is shorter than the reason itself.
const LOGIN_ERROR_ALIASES: &[(&str, &str)] = &[(
    "the_game_returned_to_the_character_list_after_entering_the_world",
    "returned_to_character_list",
)];

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
    /// Choosing a realm (SDK 2.4+).
    RealmList,
    /// Character selection.
    CharacterSelect,
    /// Creating a character (SDK 2.4+).
    CharacterCreate,
    /// Playing in the world.
    InWorld,
}

impl SessionPhase {
    /// Whether this is a screen before the world: login, realms or characters.
    pub fn is_glue(self) -> bool {
        matches!(
            self,
            Self::Login | Self::RealmList | Self::CharacterSelect | Self::CharacterCreate
        )
    }
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
    /// Current experience.
    pub xp: u64,
    /// Experience needed for the next level; `0` at the level cap.
    pub max_xp: u64,
}

/// Kind of group the player is in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupKind {
    /// Playing alone.
    Solo,
    /// In a party.
    Party,
    /// In a raid.
    Raid,
}

/// The player's group.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct GroupInfo {
    /// Kind of group.
    pub kind: GroupKind,
    /// Members including the player. Before SDK 2.1 only those the client has loaded.
    pub members: u32,
}

/// Kind of instance the character is in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InstanceKind {
    /// Dungeon.
    Party,
    /// Raid.
    Raid,
    /// Battleground.
    Pvp,
    /// Arena.
    Arena,
}

impl InstanceKind {
    fn from_sdk(kind: &str) -> Option<Self> {
        match kind {
            "party" => Some(Self::Party),
            "raid" => Some(Self::Raid),
            "pvp" => Some(Self::Pvp),
            "arena" => Some(Self::Arena),
            _ => None,
        }
    }
}

/// The instance the character is in (SDK 2.1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct InstanceInfo {
    /// Kind of instance.
    pub kind: InstanceKind,
    /// Localized instance name.
    pub name: String,
    /// Difficulty starting at `1`.
    pub difficulty: u32,
    /// Maximum number of players.
    pub max_players: u32,
}

/// Where the character is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LocationInfo {
    /// Map or instance id.
    pub map_id: u32,
    /// Zone id.
    pub zone_id: u32,
    /// `WorldMapArea` id used for zone images (SDK 2.1).
    pub map_area_id: Option<u32>,
    /// Localized zone name.
    pub zone: String,
    /// Localized sub-zone name.
    pub sub_zone: String,
    /// Instance details when the character is inside one (SDK 2.1).
    pub instance: Option<InstanceInfo>,
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

/// Server and realm a game is started for, as far as the launcher knows them.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ServerTarget {
    /// Realm list host; empty when unknown.
    pub realmlist: String,
    /// Realm name; empty when unknown.
    pub realm: String,
}

/// Log in, pick a realm and enter the world once the login screen appears.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AutoLogin {
    /// Account the characters are saved for.
    pub account_id: String,
    /// Login name.
    pub username: String,
    /// Password read from the Credential Manager.
    pub password: Password,
    /// Realm list host; empty keeps the one in the client settings.
    pub realmlist: String,
    /// Realm to select; empty lets the client choose.
    pub realm: String,
    /// Character to enter the world with; empty stops at character selection.
    pub character: String,
    /// The window was started hidden and must be shown at the end.
    pub headless: bool,
}

/// Characters read from the selection screen after an automatic login.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CharactersSeen {
    /// Account that logged in.
    pub account_id: String,
    /// Realm the characters belong to.
    pub realm: String,
    /// Characters on the selection screen.
    pub characters: Vec<SdkCharacter>,
}

/// Code of a failed automatic login, translated by the frontend.
fn login_error_code(error: &AppError) -> String {
    match error {
        AppError::SdkRpc { message, .. } => {
            let code = message.trim().to_ascii_lowercase().replace(' ', "_");
            let code = LOGIN_ERROR_ALIASES
                .iter()
                .find(|(reason, _)| *reason == code)
                .map_or(code, |(_, alias)| (*alias).to_owned());
            if LOGIN_ERROR_CODES.contains(&code.as_str()) {
                code
            } else {
                "unknown_error".to_owned()
            }
        }
        AppError::SdkUnavailable | AppError::SdkBusy | AppError::SdkUnauthorized => {
            "sdk_unavailable".to_owned()
        }
        _ => "unknown_error".to_owned(),
    }
}

/// An automatic login step that did not finish in time.
fn login_timeout(method: &str, reason: &str) -> AppError {
    AppError::SdkRpc {
        method: method.to_owned(),
        message: reason.to_owned(),
    }
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
    /// Realm list host the game connects to, when known.
    pub realmlist: Option<String>,
    /// Realm the launcher logs in to, when known.
    pub realm: Option<String>,
    /// Phase to return to when the realm list closes.
    #[serde(skip)]
    pub before_realm_list: Option<SessionPhase>,
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
    /// Group, once in the world.
    pub group: Option<GroupInfo>,
    /// The SDK event pipe is connected.
    pub sdk_connected: bool,
    /// Error code of the last session that failed to start.
    pub last_error: Option<String>,
    /// Why the automatic login or entering the world failed, while the game runs.
    pub login_error: Option<String>,
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
        self.group = None;
    }

    fn clear_loading(&mut self) {
        self.loading_progress = None;
        self.loading_screen = None;
    }

    /// Show a screen reported by the SDK, ending any loading screen.
    fn enter_screen(&mut self, screen: ClientScreen) -> FollowUp {
        match screen {
            ClientScreen::Login
            | ClientScreen::CharacterSelect
            | ClientScreen::CharacterCreate
            | ClientScreen::RealmWizard => {
                self.phase = match screen {
                    ClientScreen::Login => SessionPhase::Login,
                    ClientScreen::CharacterCreate => SessionPhase::CharacterCreate,
                    ClientScreen::RealmWizard => SessionPhase::RealmList,
                    _ => SessionPhase::CharacterSelect,
                };
                self.before_realm_list = None;
                self.clear_loading();
                self.clear_world();
                FollowUp::None
            }
            ClientScreen::World => {
                // The loading screen stays until the first read that knows the zone, so
                // Rich Presence keeps its image instead of falling back to the continent.
                self.phase = SessionPhase::InWorld;
                self.loading_progress = None;
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
            SdkEvent::ScreenChanged(
                ClientScreen::Login
                | ClientScreen::CharacterSelect
                | ClientScreen::CharacterCreate
                | ClientScreen::RealmWizard,
            ) if self.phase == SessionPhase::Loading => FollowUp::None,
            SdkEvent::ScreenChanged(screen) => self.enter_screen(*screen),
            SdkEvent::RealmList(true) if self.phase.is_glue() => {
                if self.phase != SessionPhase::RealmList {
                    self.before_realm_list = Some(self.phase);
                }
                self.phase = SessionPhase::RealmList;
                FollowUp::None
            }
            SdkEvent::RealmList(false) if self.phase == SessionPhase::RealmList => {
                match self.before_realm_list.take() {
                    Some(previous) => {
                        self.phase = previous;
                        FollowUp::SyncScreen
                    }
                    None => FollowUp::SyncScreen,
                }
            }
            SdkEvent::RealmList(_) => FollowUp::None,
            SdkEvent::LoadingFinished => self.enter_screen(ClientScreen::World),
            SdkEvent::LoadingStarted { map_id, background } => {
                self.phase = SessionPhase::Loading;
                self.location = None;
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
            SdkEvent::Game { .. }
            | SdkEvent::Social(_)
            | SdkEvent::AuthAccepted
            | SdkEvent::AuthRejected(_) => FollowUp::None,
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

/// Social events kept for slow subscribers before older ones are dropped.
const SOCIAL_EVENT_BUFFER: usize = 32;

/// Owner of the session state.
#[derive(Debug)]
pub struct GameSession {
    state: watch::Sender<SessionSnapshot>,
    rpc: RpcClient,
    social: broadcast::Sender<SocialEvent>,
    characters: broadcast::Sender<CharactersSeen>,
    game_pid: Mutex<Option<u32>>,
    auto_login: Mutex<Option<AutoLogin>>,
    /// Reads made since the last loading screen without the zone of the character.
    area_waits: AtomicU8,
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
            social: broadcast::Sender::new(SOCIAL_EVENT_BUFFER),
            characters: broadcast::Sender::new(SOCIAL_EVENT_BUFFER),
            game_pid: Mutex::new(None),
            auto_login: Mutex::new(None),
            area_waits: AtomicU8::new(0),
        }
    }

    /// Receive the characters read after each automatic login.
    pub fn subscribe_characters(&self) -> broadcast::Receiver<CharactersSeen> {
        self.characters.subscribe()
    }

    /// Log in automatically in the next SDK session.
    ///
    /// # Errors
    ///
    /// Fails when the lock is poisoned.
    pub fn set_auto_login(&self, login: Option<AutoLogin>) -> AppResult<()> {
        *self
            .auto_login
            .lock()
            .map_err(|_| AppError::LockPoisoned("automatic login"))? = login;
        Ok(())
    }

    fn take_auto_login(&self) -> Option<AutoLogin> {
        self.auto_login
            .lock()
            .ok()
            .and_then(|mut guard| guard.take())
    }

    /// Receive social, trade, duel and queue events (SDK 2.1+).
    pub fn subscribe_social(&self) -> broadcast::Receiver<SocialEvent> {
        self.social.subscribe()
    }

    /// Typed access to the SDK of the running game.
    pub fn api(&self) -> SdkApi<'_> {
        SdkApi::new(&self.rpc)
    }

    /// Remember the process id of the game launched through the injector.
    pub fn set_game_pid(&self, pid: Option<u32>) {
        match self.game_pid.lock() {
            Ok(mut guard) => *guard = pid,
            Err(error) => tracing::warn!(%error, "Could not store the game process id"),
        }
    }

    /// Process id of the running game, when known.
    pub fn game_pid(&self) -> Option<u32> {
        self.game_pid.lock().ok().and_then(|guard| *guard)
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
    pub fn begin(&self, game: &Game, mode: LaunchMode, server: ServerTarget) -> AppResult<()> {
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
                realmlist: Some(server.realmlist.clone()).filter(|value| !value.trim().is_empty()),
                realm: Some(server.realm.clone()).filter(|value| !value.trim().is_empty()),
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

    /// Authenticate the following SDK requests with a session token (SDK 2.0+).
    ///
    /// # Errors
    ///
    /// Fails when the token lock is poisoned.
    pub fn set_token(&self, token: Option<SessionToken>) -> AppResult<()> {
        self.rpc.set_token(token)
    }

    /// End the session, recording the error that stopped it, if any.
    pub fn finish(&self, error: Option<&AppError>) {
        if let Err(lock_error) = self.rpc.set_token(None) {
            tracing::warn!(%lock_error, "Could not clear the SDK session token");
        }
        self.set_game_pid(None);
        if let Err(lock_error) = self.set_auto_login(None) {
            tracing::warn!(%lock_error, "Could not clear the automatic login");
        }
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
        let token = match self.rpc.token() {
            Ok(token) => token,
            Err(error) => {
                self.finish(Some(&error));
                return;
            }
        };
        let mut stream = match EventStream::connect(EVENT_PIPE_TIMEOUT, token.as_ref()).await {
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

        let auto_login = self.take_auto_login();
        let login_task = async {
            if let Some(login) = auto_login {
                self.auto_login(&api, login).await;
            }
        };
        tokio::pin!(login_task);
        let mut login_done = false;

        let mut stalls = StallDetector::default();
        let mut refresh_at: Option<Instant> = None;
        let mut ticks: u32 = 0;
        let mut tick = interval(TICK);
        tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                event = stream.next() => match event {
                    Ok(Some(SdkEvent::Social(social))) => {
                        let _ = self.social.send(social);
                    }
                    Ok(Some(event)) => {
                        stalls.observe(&event, Instant::now());
                        if matches!(event, SdkEvent::LoadingStarted { .. }) {
                            self.area_waits.store(0, Ordering::Relaxed);
                        }
                        let mut follow_up = FollowUp::None;
                        self.update(|snapshot| follow_up = snapshot.apply(&event));
                        if follow_up == FollowUp::Refresh && matches!(event, SdkEvent::Game { .. }) {
                            // Game events come in bursts (three zone events per zone change):
                            // read the state once after the burst.
                            refresh_at.get_or_insert_with(|| Instant::now() + EVENT_REFRESH_DELAY);
                        } else if self.follow_up(&api, follow_up).await {
                            refresh_at.get_or_insert_with(|| Instant::now() + AREA_RETRY_DELAY);
                        }
                    }
                    Ok(None) => break,
                    Err(error) => {
                        tracing::warn!(%error, "SDK event stream failed");
                        break;
                    }
                },
                () = &mut login_task, if !login_done => login_done = true,
                () = sleep_until(refresh_at.unwrap_or_else(Instant::now)), if refresh_at.is_some() => {
                    refresh_at = None;
                    let in_world = self.state.borrow().phase == SessionPhase::InWorld;
                    if in_world && self.refresh(&api).await {
                        refresh_at = Some(Instant::now() + AREA_RETRY_DELAY);
                    }
                }
                _ = tick.tick() => {
                    ticks = ticks.wrapping_add(1);
                    let phase = self.state.borrow().phase;
                    if phase == SessionPhase::Loading && stalls.take_stalled(Instant::now()) {
                        tracing::debug!("Loading never progressed; reading the current screen");
                        self.sync_screen(&api).await;
                    } else if phase == SessionPhase::InWorld
                        && ticks.is_multiple_of(REFRESH_EVERY_TICKS)
                        && self.refresh(&api).await
                    {
                        refresh_at.get_or_insert_with(|| Instant::now() + AREA_RETRY_DELAY);
                    }
                }
            }
        }
        self.finish(None);
    }

    /// Run an automatic login and show a hidden window at the end, whatever happened.
    async fn auto_login(&self, api: &SdkApi<'_>, login: AutoLogin) {
        if let Err(error) = self.log_in(api, &login).await {
            tracing::warn!(%error, "Automatic login failed");
            let code = login_error_code(&error);
            self.update(|snapshot| snapshot.login_error = Some(code));
        }
        if login.headless
            && let Err(error) = api.show_window().await
        {
            tracing::warn!(%error, "Could not show the hidden game window");
        }
    }

    async fn log_in(&self, api: &SdkApi<'_>, login: &AutoLogin) -> AppResult<()> {
        if !self
            .reached_phase(SessionPhase::Login, LOGIN_SCREEN_TIMEOUT)
            .await
        {
            return Err(login_timeout("client.login", "not on login screen"));
        }
        tracing::info!(account_id = %login.account_id, "Logging in automatically");
        let non_empty = |text: &str| (!text.is_empty()).then(|| text.to_owned());
        let realmlist = non_empty(&login.realmlist);
        let realm = non_empty(&login.realm);
        api.login(
            &login.username,
            &login.password,
            realmlist.as_deref(),
            realm.as_deref(),
        )
        .await?;
        if !self
            .reached_phase(SessionPhase::CharacterSelect, CHARACTER_SELECT_TIMEOUT)
            .await
        {
            return Err(login_timeout("client.login", "realm select timeout"));
        }

        let characters = self.read_characters(api).await;
        if !characters.is_empty() {
            let _ = self.characters.send(CharactersSeen {
                account_id: login.account_id.clone(),
                realm: login.realm.clone(),
                characters,
            });
        }
        if !login.character.is_empty() {
            api.enter_world(&login.character).await?;
        }
        Ok(())
    }

    /// The character list, retried briefly while the server is still sending it.
    async fn read_characters(&self, api: &SdkApi<'_>) -> Vec<SdkCharacter> {
        for attempt in 1..=CHARACTER_LIST_ATTEMPTS {
            match api.characters().await {
                Ok(characters) if !characters.is_empty() => return characters,
                Ok(_) => {}
                Err(error) => tracing::debug!(%error, attempt, "Could not read the characters"),
            }
            tokio::time::sleep(CHARACTER_LIST_RETRY).await;
        }
        Vec::new()
    }

    /// Wait until the session reaches a phase; `false` when it did not in time.
    async fn reached_phase(&self, phase: SessionPhase, limit: Duration) -> bool {
        let mut changes = self.state.subscribe();
        matches!(
            tokio::time::timeout(limit, changes.wait_for(|snapshot| snapshot.phase == phase)).await,
            Ok(Ok(_))
        )
    }

    /// Run a follow-up; returns whether the zone is still unknown and must be read again.
    async fn follow_up(&self, api: &SdkApi<'_>, follow_up: FollowUp) -> bool {
        match follow_up {
            FollowUp::None => false,
            FollowUp::Refresh => self.refresh(api).await,
            FollowUp::SyncScreen => self.sync_screen(api).await,
        }
    }

    /// Set the phase from the screen the SDK reports now, ending any loading
    /// screen (the event stream only reports changes).
    async fn sync_screen(&self, api: &SdkApi<'_>) -> bool {
        match api.screen().await {
            Ok(screen) => {
                let screen = ClientScreen::from_name(&screen.screen, screen.in_world);
                let mut follow_up = FollowUp::None;
                self.update(|snapshot| follow_up = snapshot.enter_screen(screen));
                follow_up == FollowUp::Refresh && self.refresh(api).await
            }
            Err(error) => {
                tracing::debug!(%error, "Could not read the current screen");
                false
            }
        }
    }

    /// Read the character, location and flags from the SDK.
    ///
    /// Right after a loading screen the client may still report no zone, or the map it
    /// left. The location is then left unknown and `true` is returned so the caller reads
    /// again shortly, up to [`AREA_RETRIES`] times.
    async fn refresh(&self, api: &SdkApi<'_>) -> bool {
        let mut zone_pending = false;
        let may_wait = self.area_waits.load(Ordering::Relaxed) < AREA_RETRIES;
        let (player, world, unit, group) = tokio::join!(
            api.player_state(),
            api.world_state(),
            api.unit("player"),
            api.group()
        );
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
                    xp: player.xp,
                    max_xp: player.max_xp,
                });
            }
            let destination = snapshot
                .loading_screen
                .as_ref()
                .and_then(|screen| screen.map_id)
                .and_then(|map_id| u32::try_from(map_id).ok());
            let placed = world.as_ref().is_ok_and(|world| {
                world.map_area_id != 0 && destination.is_none_or(|map_id| map_id == world.map_id)
            });
            if may_wait && !placed && snapshot.location.is_none() {
                zone_pending = true;
            } else if let Ok(world) = &world
                && world.valid
                && !world.loading
            {
                snapshot.clear_loading();
                let instance = world.instance.as_ref().and_then(|instance| {
                    let kind = InstanceKind::from_sdk(&instance.kind)?;
                    instance.in_instance.then(|| InstanceInfo {
                        kind,
                        name: instance.map_name.clone(),
                        difficulty: instance.difficulty,
                        max_players: instance.max_players,
                    })
                });
                snapshot.location = Some(LocationInfo {
                    map_id: world.map_id,
                    zone_id: world.zone_id,
                    map_area_id: (world.map_area_id != 0).then_some(world.map_area_id),
                    zone: world.zone_name.clone(),
                    sub_zone: world.sub_zone_name.clone(),
                    instance,
                });
            }
            if let Ok(group) = &group {
                let kind = match (group.valid, group.kind.as_str()) {
                    (true, "raid") => GroupKind::Raid,
                    (true, "party") => GroupKind::Party,
                    _ => GroupKind::Solo,
                };
                snapshot.group = Some(GroupInfo {
                    kind,
                    members: match (kind, group.size) {
                        (GroupKind::Solo, _) => 1,
                        (_, Some(size)) if size > 0 => size,
                        _ => group.member_count + 1,
                    },
                });
            }
        });
        let failed: Vec<String> = [
            ("player.getState", player.err()),
            ("world.getState", world.err()),
            ("unit.get", unit.err()),
            ("group.get", group.err()),
        ]
        .into_iter()
        .filter_map(|(method, error)| error.map(|error| format!("{method}: {error}")))
        .collect();
        if !failed.is_empty() {
            tracing::debug!(
                failed = %failed.join("; "),
                "SDK state refresh incomplete; the previous values are kept"
            );
        }
        if zone_pending {
            self.area_waits.fetch_add(1, Ordering::Relaxed);
        } else {
            self.area_waits.store(0, Ordering::Relaxed);
        }
        zone_pending
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
        assert!(
            snapshot.loading_screen.is_some(),
            "the loading screen stays until the zone is read"
        );

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
        session.begin(&game(), LaunchMode::Direct, ServerTarget::default())?;
        assert!(changes.has_changed().unwrap_or(false));
        assert!(matches!(
            session.begin(&game(), LaunchMode::Sdk, ServerTarget::default()),
            Err(AppError::GameAlreadyRunning)
        ));

        session.finish(Some(&AppError::SdkUnavailable));
        let snapshot = session.snapshot();
        assert!(!snapshot.is_active());
        assert_eq!(snapshot.last_error.as_deref(), Some("sdk_unavailable"));
        session.begin(&game(), LaunchMode::Sdk, ServerTarget::default())?;
        assert_eq!(session.snapshot().mode, Some(LaunchMode::Sdk));
        Ok(())
    }

    #[test]
    fn maps_login_failures_to_codes() {
        let rpc = |message: &str| AppError::SdkRpc {
            method: "client.login".to_owned(),
            message: message.to_owned(),
        };
        assert_eq!(
            login_error_code(&rpc("incorrect password")),
            "incorrect_password"
        );
        assert_eq!(
            login_error_code(&rpc("Character not found")),
            "character_not_found"
        );
        assert_eq!(login_error_code(&rpc("something new")), "unknown_error");
        assert_eq!(
            login_error_code(&rpc(
                "the game returned to the character list after entering the world"
            )),
            "returned_to_character_list"
        );
        assert_eq!(
            login_error_code(&AppError::SdkUnavailable),
            "sdk_unavailable"
        );
        assert_eq!(
            login_error_code(&AppError::GameAlreadyRunning),
            "unknown_error"
        );
    }

    #[test]
    fn waits_for_a_phase() {
        let session = GameSession::new();
        let wait = Duration::from_millis(10);
        assert!(!tauri::async_runtime::block_on(
            session.reached_phase(SessionPhase::Login, wait)
        ));
        session.update(|snapshot| snapshot.phase = SessionPhase::Login);
        assert!(tauri::async_runtime::block_on(
            session.reached_phase(SessionPhase::Login, wait)
        ));
    }
}
