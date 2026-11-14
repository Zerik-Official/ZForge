//! Names of the events the backend emits to the frontend.

/// Splash screen step; payload: [`crate::commands::boot::BootProgress`].
pub const BOOT_PROGRESS: &str = "boot://progress";

/// SDK download progress; payload: [`crate::services::sdk::installer::DownloadProgress`].
pub const SDK_DOWNLOAD_PROGRESS: &str = "sdk://download-progress";
