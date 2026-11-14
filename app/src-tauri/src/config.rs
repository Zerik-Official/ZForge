//! Build-time configuration.

/// Discord application id used for Rich Presence.
///
/// Taken at compile time from `ZFORGE_DISCORD_CLIENT_ID`, or from
/// `DISCORD_CLIENT_ID` in `app/.env` (see `build.rs`); empty when not configured.
pub const DISCORD_CLIENT_ID: &str = match option_env!("ZFORGE_DISCORD_CLIENT_ID") {
    Some(id) => id,
    None => "",
};
