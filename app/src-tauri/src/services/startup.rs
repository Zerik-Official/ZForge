//! How the launcher was started: by Windows at sign-in, from a game shortcut, or again
//! while it was already running.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_autostart::ManagerExt;

use crate::domain::shortcut::{ShortcutAction, started_by_autostart};
use crate::error::{AppError, AppResult};
use crate::events;
use crate::services::tray;

/// What the launcher was asked to do when it started.
#[derive(Debug, Default)]
pub struct StartupState {
    /// Shortcut action not yet taken by the frontend.
    pending: Mutex<Option<ShortcutAction>>,
    /// Whether the launcher started hidden in the notification area.
    in_tray: AtomicBool,
}

impl StartupState {
    /// Read the arguments the launcher process was started with.
    pub fn from_args<I, S>(args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let args: Vec<String> = args
            .into_iter()
            .map(|arg| arg.as_ref().to_owned())
            .collect();
        Self {
            pending: Mutex::new(ShortcutAction::from_args(&args)),
            in_tray: AtomicBool::new(false),
        }
    }

    /// Whether Windows started the launcher at sign-in.
    pub fn started_by_autostart() -> bool {
        started_by_autostart(std::env::args())
    }

    /// Remember that the launcher started hidden in the notification area.
    pub fn mark_in_tray(&self) {
        self.in_tray.store(true, Ordering::Relaxed);
    }

    /// Whether the launcher started hidden in the notification area.
    pub fn in_tray(&self) -> bool {
        self.in_tray.load(Ordering::Relaxed)
    }

    /// Take the shortcut action of the launch, once.
    ///
    /// # Errors
    ///
    /// Returns an error when the lock is poisoned.
    pub fn take_pending(&self) -> AppResult<Option<ShortcutAction>> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| AppError::LockPoisoned("startup shortcut action"))?;
        Ok(pending.take())
    }
}

/// Handle a second launch while the launcher is running: show the window and pass the
/// shortcut action, if any, to the frontend.
pub fn on_second_instance<R: Runtime>(app: &AppHandle<R>, args: &[String]) {
    tray::show_main_window(app);
    if let Some(action) = ShortcutAction::from_args(args)
        && let Err(error) = app.emit(events::SHORTCUT_ACTION, action)
    {
        tracing::warn!(%error, "Could not pass the shortcut action to the window");
    }
}

/// Whether Windows starts the launcher at sign-in.
///
/// # Errors
///
/// Returns an error when the Windows startup entry cannot be read.
pub fn autostart_enabled<R: Runtime>(app: &AppHandle<R>) -> AppResult<bool> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| AppError::AutostartFailed(error.to_string()))
}

/// Turn starting with Windows on or off and return the resulting state.
///
/// # Errors
///
/// Returns an error when the Windows startup entry cannot be written.
pub fn set_autostart<R: Runtime>(app: &AppHandle<R>, enabled: bool) -> AppResult<bool> {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|error| AppError::AutostartFailed(error.to_string()))?;
    autostart_enabled(app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hands_out_the_shortcut_action_once() -> AppResult<()> {
        let state = StartupState::from_args(["ZForge.exe", "--game", "game-1", "--launch"]);
        let action = state.take_pending()?;
        assert_eq!(
            action.map(|action| (action.game_id, action.launch)),
            Some(("game-1".into(), true))
        );
        assert_eq!(state.take_pending()?, None);
        Ok(())
    }
}
