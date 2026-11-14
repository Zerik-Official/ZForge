//! Asset catalogue and native file picker commands.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use crate::services::assets::{self, AssetManifest, CustomAssetKind};

const MAIN_WINDOW_LABEL: &str = "main";

/// Show a native "open file" dialog attached to the main window.
async fn pick_file<R: Runtime>(
    app: &AppHandle<R>,
    filter_name: &str,
    extensions: &[&str],
) -> AppResult<Option<PathBuf>> {
    let (sender, receiver) = oneshot::channel();
    let mut dialog = app.dialog().file().add_filter(filter_name, extensions);
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        dialog = dialog.set_parent(&window);
    }
    dialog.pick_file(move |picked| {
        // The receiver is only gone if the command was cancelled; nothing to report then.
        let _ = sender.send(picked);
    });
    receiver
        .await
        .ok()
        .flatten()
        .map(|picked| {
            picked
                .into_path()
                .map_err(|error| AppError::PathResolution(error.to_string()))
        })
        .transpose()
}

/// Bundled media grouped for the add/edit game modal.
#[tauri::command]
pub async fn list_assets() -> AppResult<AssetManifest> {
    Ok(assets::manifest())
}

/// Let the user pick the game executable.
#[tauri::command]
pub async fn select_exe<R: Runtime>(app: AppHandle<R>) -> AppResult<Option<String>> {
    let picked = pick_file(&app, "WoW Executable", &["exe"]).await?;
    Ok(picked.map(|path| path.to_string_lossy().into_owned()))
}

/// Let the user pick a media file and copy it into the custom assets folder.
#[tauri::command]
pub async fn select_custom_asset<R: Runtime>(
    app: AppHandle<R>,
    paths: State<'_, AppPaths>,
    kind: CustomAssetKind,
) -> AppResult<Option<String>> {
    let (filter_name, extensions) = kind.dialog_filter();
    let Some(source) = pick_file(&app, filter_name, extensions).await? else {
        return Ok(None);
    };
    let paths = paths.inner().clone();
    let imported = tauri::async_runtime::spawn_blocking(move || {
        assets::import_custom_asset(&paths, kind, &source)
    })
    .await
    .map_err(|error| AppError::BackgroundTask(error.to_string()))??;
    Ok(Some(imported.to_string_lossy().into_owned()))
}
