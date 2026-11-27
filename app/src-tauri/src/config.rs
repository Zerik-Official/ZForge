//! Build-time configuration.

/// Discord application id used for Rich Presence.
///
/// Taken at compile time from `ZFORGE_DISCORD_CLIENT_ID`, or from
/// `DISCORD_CLIENT_ID` in `app/.env` (see `build.rs`); empty when not configured.
pub const DISCORD_CLIENT_ID: &str = match option_env!("ZFORGE_DISCORD_CLIENT_ID") {
    Some(id) => id,
    None => "",
};

/// Public repository of the launcher, used to link the commit it was built from.
pub const REPOSITORY_URL: &str = "https://github.com/Zerik-Official/ZForge";

/// Full hash of the commit the launcher was built from (see `build.rs`).
pub const BUILD_COMMIT: Option<&str> = option_env!("ZFORGE_COMMIT");

/// Commit date in ISO 8601, with its time zone.
pub const BUILD_COMMIT_DATE: Option<&str> = option_env!("ZFORGE_COMMIT_DATE");

/// Whether tracked files had uncommitted changes when the launcher was built.
pub const BUILD_DIRTY: bool = option_env!("ZFORGE_COMMIT_DIRTY").is_some();
