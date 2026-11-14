//! Persistence: SQLite database and the global `config.json` file.

pub mod app_config;
pub mod database;
mod game_settings;
mod games;
mod migrations;
mod servers;

pub use database::Database;
