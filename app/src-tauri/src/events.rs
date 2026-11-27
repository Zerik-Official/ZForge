//! Names of the events the backend emits to the frontend.

/// Splash screen step; payload: [`crate::commands::boot::BootProgress`].
pub const BOOT_PROGRESS: &str = "boot://progress";

/// Game session changed; payload: [`crate::services::session::SessionSnapshot`].
pub const SESSION_CHANGED: &str = "session://changed";

/// SDK download progress; payload: [`crate::services::sdk::installer::DownloadProgress`].
pub const SDK_DOWNLOAD_PROGRESS: &str = "sdk://download-progress";

/// The installed SDK changed, so the available features may differ; no payload.
pub const CAPABILITIES_CHANGED: &str = "capabilities://changed";

/// Saved accounts or their characters changed; no payload.
pub const ACCOUNTS_CHANGED: &str = "accounts://changed";

/// Progress of the media downloaded from the assets CDN during the boot.
pub const RESOURCES_PROGRESS: &str = "resources://progress";

/// Progress of the launcher update download.
pub const UPDATE_PROGRESS: &str = "update://progress";
