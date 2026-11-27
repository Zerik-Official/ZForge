//! Domain models shared by storage, services and IPC commands.

pub mod account;
pub mod addon;
pub mod app_config;
pub mod build_info;
pub mod game;
pub mod game_settings;
pub mod server;
pub mod settings_schema;
pub mod shortcut;
pub mod theme;

use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since the Unix epoch, used for every persisted timestamp.
pub type UnixMillis = i64;

/// Current time as [`UnixMillis`], or `0` if the system clock predates the epoch.
pub fn now_millis() -> UnixMillis {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}
