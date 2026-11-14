//! Discord Rich Presence fed by the game session.
//!
//! A tokio task turns session snapshots into [`activity::PresenceActivity`]
//! values and forwards only real changes to a dedicated thread that owns the
//! Discord IPC connection. That thread throttles updates to Discord's rate
//! limit and reconnects when Discord is closed or restarted.

pub mod activity;
pub mod strings;

use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use discord_rich_presence::activity::{Activity, Assets, Party, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use tokio::sync::watch;

use crate::services::presence::activity::PresenceActivity;
use crate::services::presence::strings::PresenceStrings;
use crate::services::session::SessionSnapshot;

/// Minimum time between two updates (Discord allows about five per 20 seconds).
const MIN_UPDATE_INTERVAL: Duration = Duration::from_secs(4);

/// Wait before retrying when Discord is not running.
const RECONNECT_DELAY: Duration = Duration::from_secs(15);

/// User preferences that decide whether and how the presence is shown.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PresenceSettings {
    /// Rich Presence is enabled in the launcher.
    pub enabled: bool,
    /// Translated texts; nothing is shown until the frontend sends them.
    pub strings: Option<PresenceStrings>,
}

/// Handle to the running Rich Presence service.
#[derive(Debug)]
pub struct PresenceService {
    settings: watch::Sender<PresenceSettings>,
}

impl PresenceService {
    /// Start following the session. Without a client id the service stays idle.
    pub fn start(
        client_id: &str,
        enabled: bool,
        mut session: watch::Receiver<SessionSnapshot>,
    ) -> Self {
        let (settings, mut settings_changes) = watch::channel(PresenceSettings {
            enabled,
            strings: None,
        });
        let service = Self { settings };

        if client_id.trim().is_empty() {
            tracing::info!("Rich Presence disabled: no Discord client id configured");
            return service;
        }

        let (sender, receiver) = mpsc::channel::<Option<PresenceActivity>>();
        let client_id = client_id.to_owned();
        if let Err(error) = thread::Builder::new()
            .name("discord-presence".to_owned())
            .spawn(move || run_discord(&client_id, &receiver))
        {
            tracing::error!(%error, "Could not start the Rich Presence thread");
            return service;
        }

        tauri::async_runtime::spawn(async move {
            let mut last: Option<PresenceActivity> = None;
            loop {
                let desired = {
                    let settings = settings_changes.borrow_and_update();
                    match (&settings.strings, settings.enabled) {
                        (Some(strings), true) => {
                            activity::build(&session.borrow_and_update(), strings)
                        }
                        _ => None,
                    }
                };
                if desired != last {
                    if sender.send(desired.clone()).is_err() {
                        break;
                    }
                    last = desired;
                }
                tokio::select! {
                    changed = session.changed() => if changed.is_err() { break },
                    changed = settings_changes.changed() => if changed.is_err() { break },
                }
            }
        });
        service
    }

    /// Enable or disable the presence.
    pub fn set_enabled(&self, enabled: bool) {
        self.settings.send_if_modified(|settings| {
            let changed = settings.enabled != enabled;
            settings.enabled = enabled;
            changed
        });
    }

    /// Use new translated texts.
    pub fn set_strings(&self, strings: PresenceStrings) {
        self.settings.send_if_modified(|settings| {
            let changed = settings.strings.as_ref() != Some(&strings);
            settings.strings = Some(strings);
            changed
        });
    }
}

fn to_discord(activity: &PresenceActivity) -> Activity<'_> {
    let mut assets = Assets::new().large_image(activity.large_image.as_str());
    if let Some(text) = &activity.large_text {
        assets = assets.large_text(text.as_str());
    }
    if let Some(image) = &activity.small_image {
        assets = assets.small_image(image.as_str());
    }
    if let Some(text) = &activity.small_text {
        assets = assets.small_text(text.as_str());
    }

    let mut payload = Activity::new().assets(assets);
    if let Some(details) = &activity.details {
        payload = payload.details(details.as_str());
    }
    if let Some(state) = &activity.state {
        payload = payload.state(state.as_str());
    }
    if let Some(start) = activity.start {
        payload = payload.timestamps(Timestamps::new().start(start));
    }
    if let Some(size) = activity.party {
        payload = payload.party(Party::new().size(size));
    }
    payload
}

/// Keep only the newest pending value.
fn latest(
    receiver: &Receiver<Option<PresenceActivity>>,
    mut current: Option<PresenceActivity>,
) -> Option<PresenceActivity> {
    while let Ok(next) = receiver.try_recv() {
        current = next;
    }
    current
}

/// Owns the Discord connection; exits when the session task stops.
fn run_discord(client_id: &str, receiver: &Receiver<Option<PresenceActivity>>) {
    let mut client: Option<DiscordIpcClient> = None;
    let mut pending: Option<Option<PresenceActivity>> = None;
    let mut last_update = Instant::now()
        .checked_sub(MIN_UPDATE_INTERVAL)
        .unwrap_or_else(Instant::now);

    loop {
        let wait = pending
            .as_ref()
            .map(|_| MIN_UPDATE_INTERVAL.saturating_sub(last_update.elapsed()));
        let received = match wait {
            None => receiver.recv().map_err(|_| RecvTimeoutError::Disconnected),
            Some(wait) if wait.is_zero() => Err(RecvTimeoutError::Timeout),
            Some(wait) => receiver.recv_timeout(wait),
        };
        match received {
            Ok(value) => {
                pending = Some(latest(receiver, value));
                continue;
            }
            Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => {}
        }

        let Some(desired) = pending.take() else {
            continue;
        };
        last_update = Instant::now();
        match apply(client_id, &mut client, desired.as_ref()) {
            Ok(()) => {}
            Err(error) => {
                tracing::debug!(%error, "Discord update failed; retrying later");
                client = None;
                pending = Some(desired);
                match receiver.recv_timeout(RECONNECT_DELAY) {
                    Ok(value) => pending = Some(latest(receiver, value)),
                    Err(RecvTimeoutError::Disconnected) => break,
                    Err(RecvTimeoutError::Timeout) => {}
                }
            }
        }
    }

    if let Some(mut client) = client {
        let _ = client.clear_activity();
        let _ = client.close();
    }
}

fn apply(
    client_id: &str,
    client: &mut Option<DiscordIpcClient>,
    desired: Option<&PresenceActivity>,
) -> Result<(), discord_rich_presence::error::Error> {
    match desired {
        Some(activity) => {
            if client.is_none() {
                let mut connection = DiscordIpcClient::new(client_id);
                connection.connect()?;
                tracing::info!("Connected to Discord");
                *client = Some(connection);
            }
            if let Some(connection) = client.as_mut() {
                connection.set_activity(to_discord(activity))?;
            }
        }
        None => {
            if let Some(mut connection) = client.take() {
                connection.clear_activity()?;
                connection.close()?;
                tracing::info!("Rich Presence cleared");
            }
        }
    }
    Ok(())
}
