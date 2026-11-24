//! Icon in the Windows notification area that keeps the launcher running when its
//! window is closed with the "close to tray" preference on.

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};

/// Identifier of the launcher tray icon.
const TRAY_ID: &str = "main";

/// Label of the main window.
const MAIN_WINDOW: &str = "main";

const MENU_OPEN: &str = "open";
const MENU_QUIT: &str = "quit";

/// Translated texts of the tray menu.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct TrayStrings {
    /// Show the launcher window.
    pub open: String,
    /// Quit the launcher.
    pub quit: String,
}

/// Create the tray icon, or replace its menu texts, and show it only when `visible`.
///
/// # Errors
///
/// Returns an error when the menu or the icon cannot be created.
pub fn update<R: Runtime>(
    app: &AppHandle<R>,
    strings: &TrayStrings,
    visible: bool,
) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, MENU_OPEN, &strings.open, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, &strings.quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &separator, &quit])?;

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu))?;
        return tray.set_visible(visible);
    }

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(app.package_info().name.clone())
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_OPEN => show_main_window(app),
            MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let tray = builder.build(app)?;
    tray.set_visible(visible)
}

/// Show or hide the tray icon, if it exists.
pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) {
    if let Some(tray) = app.tray_by_id(TRAY_ID)
        && let Err(error) = tray.set_visible(visible)
    {
        tracing::warn!(%error, "Could not change the tray icon visibility");
    }
}

/// Whether the tray icon exists, so a hidden window can be brought back.
pub fn exists<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.tray_by_id(TRAY_ID).is_some()
}

/// Whether this window is the launcher main window.
pub fn is_main_window(label: &str) -> bool {
    label == MAIN_WINDOW
}

/// Bring the main window back from the tray.
fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let shown = window
        .show()
        .and_then(|()| window.unminimize())
        .and_then(|()| window.set_focus());
    if let Err(error) = shown {
        tracing::warn!(%error, "Could not show the launcher window");
    }
}
