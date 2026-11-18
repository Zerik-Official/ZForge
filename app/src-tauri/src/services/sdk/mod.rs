//! WoWControlSDK: installation management and the runtime client.
//!
//! The SDK is downloaded from its GitHub releases into
//! `<app_data_dir>/tools/WoWControlSDK-v<version>/`. Once injected into the
//! game, it is reached through the command pipe ([`rpc`], [`api`]) and the
//! event pipe ([`events`]).

pub mod api;
pub mod auth;
pub mod capabilities;
pub mod events;
pub mod installation;
pub mod installer;
pub mod manager;
mod pipe;
pub mod release;
pub mod rpc;
pub mod social;
pub mod version;

/// GitHub repository that publishes SDK releases.
pub const SDK_REPOSITORY: &str = "Zerik-Official/WoWControlSDK";

/// Folder and release asset name prefix.
pub const SDK_PREFIX: &str = "WoWControlSDK-";

/// Error code stored when a previously installed SDK is missing or corrupted.
pub const ERROR_SDK_CORRUPTED: &str = "sdk_corrupted";
