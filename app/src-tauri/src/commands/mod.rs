//! IPC commands exposed to the frontend.
//!
//! Commands only translate arguments and delegate to services; business rules
//! live in [`crate::services`].

pub mod accounts;
pub mod addons;
pub mod app_config;
pub mod assets;
pub mod boot;
pub mod games;
pub mod notifications;
pub mod presence;
pub mod sdk;
pub mod servers;
pub mod session;
pub mod settings;
pub mod startup;
pub mod system;
pub mod themes;
pub mod tray;
pub mod updater;
