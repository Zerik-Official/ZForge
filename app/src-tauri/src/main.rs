//! Binary entry point for the ZForge desktop host.

// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::ExitCode;

fn main() -> ExitCode {
    match zforge_lib::run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            tracing::error!(%error, "Application terminated with an error");
            ExitCode::FAILURE
        }
    }
}
