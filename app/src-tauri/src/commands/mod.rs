//! IPC commands exposed to the frontend.
//!
//! Commands only translate arguments and delegate to services; business rules
//! live in [`crate::services`].

pub mod app_config;
pub mod assets;
pub mod boot;
pub mod games;
pub mod sdk;
pub mod servers;
pub mod settings;
pub mod system;
