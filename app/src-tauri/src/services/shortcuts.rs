//! Desktop shortcuts that open the launcher on a game or launch it.

use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat, RgbaImage};
use mslnk::ShellLink;
use tauri::{AppHandle, Manager, Runtime};

use crate::domain::game::Game;
use crate::domain::shortcut::ShortcutAction;
use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use crate::services::assets::RESOURCE_PREFIX;

/// Largest side of an icon inside a Windows `.ico` file.
const ICON_SIZE: u32 = 256;

/// Characters Windows does not allow in file names.
const FORBIDDEN_NAME_CHARACTERS: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// Create (or replace) the desktop shortcut of a game and return its path.
///
/// The shortcut runs the launcher with the arguments of `action` and shows the game icon.
///
/// # Errors
///
/// Returns an error when the desktop folder, the launcher executable or the shortcut
/// file cannot be resolved or written.
pub fn create<R: Runtime>(
    app: &AppHandle<R>,
    paths: &AppPaths,
    game: &Game,
    action: &ShortcutAction,
) -> AppResult<PathBuf> {
    let desktop = app
        .path()
        .desktop_dir()
        .map_err(|error| AppError::PathResolution(error.to_string()))?;
    let executable = std::env::current_exe()?;

    let mut link =
        ShellLink::new(&executable).map_err(|error| AppError::ShortcutFailed(error.to_string()))?;
    link.set_arguments(Some(join_arguments(&action.to_args())));
    if let Some(folder) = executable.parent() {
        link.set_working_dir(Some(folder.to_string_lossy().into_owned()));
    }
    match write_icon(app, paths, game) {
        Ok(icon) => link.set_icon_location(Some(icon.to_string_lossy().into_owned())),
        Err(error) => {
            tracing::warn!(%error, game = %game.id, "Could not prepare the shortcut icon")
        }
    }

    let path = desktop.join(format!("{}.lnk", file_name(&game.name)));
    link.create_lnk(&path)
        .map_err(|error| AppError::ShortcutFailed(error.to_string()))?;
    tracing::info!(game = %game.id, path = %path.display(), "Created a game shortcut");
    Ok(path)
}

/// Write the game icon as an `.ico` file for the shortcut.
fn write_icon<R: Runtime>(app: &AppHandle<R>, paths: &AppPaths, game: &Game) -> AppResult<PathBuf> {
    let bytes = read_asset(app, paths, &game.icon)?;
    let folder = paths.shortcut_icons_dir();
    fs::create_dir_all(&folder)?;
    let target = folder.join(format!("{}.ico", game.id));

    if image::guess_format(&bytes).ok() == Some(ImageFormat::Ico) {
        fs::write(&target, &bytes)?;
        return Ok(target);
    }
    let decoded = image::load_from_memory(&bytes)
        .map_err(|error| AppError::ShortcutFailed(error.to_string()))?;
    let mut encoded = Cursor::new(Vec::new());
    square_icon(&decoded)
        .write_to(&mut encoded, ImageFormat::Ico)
        .map_err(|error| AppError::ShortcutFailed(error.to_string()))?;
    fs::write(&target, encoded.into_inner())?;
    Ok(target)
}

/// Fit an image in a transparent square of [`ICON_SIZE`] pixels.
fn square_icon(image: &DynamicImage) -> DynamicImage {
    let fitted = image
        .resize(ICON_SIZE, ICON_SIZE, FilterType::Lanczos3)
        .to_rgba8();
    let mut canvas = RgbaImage::new(ICON_SIZE, ICON_SIZE);
    let left = (ICON_SIZE - fitted.width()) / 2;
    let top = (ICON_SIZE - fitted.height()) / 2;
    image::imageops::overlay(&mut canvas, &fitted, i64::from(left), i64::from(top));
    DynamicImage::ImageRgba8(canvas)
}

/// Bytes of a stored asset reference: a bundled web asset, a downloaded resource or a
/// custom file on disk.
fn read_asset<R: Runtime>(
    app: &AppHandle<R>,
    paths: &AppPaths,
    reference: &str,
) -> AppResult<Vec<u8>> {
    if let Some(relative) = reference.strip_prefix(RESOURCE_PREFIX) {
        return Ok(fs::read(paths.resources_dir().join(relative))?);
    }
    if Path::new(reference).is_absolute() && !reference.starts_with('/') {
        return Ok(fs::read(reference)?);
    }
    app.asset_resolver()
        .get(reference.to_owned())
        .map(|asset| asset.bytes)
        .ok_or_else(|| AppError::NotFound {
            entity: "asset",
            id: reference.to_owned(),
        })
}

/// A file name for the shortcut, without characters Windows rejects.
fn file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|character| {
            if FORBIDDEN_NAME_CHARACTERS.contains(&character) || character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches('.').trim();
    if trimmed.is_empty() {
        "ZForge".to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// Join arguments for a shortcut, quoting those with spaces.
fn join_arguments(args: &[String]) -> String {
    args.iter()
        .map(|arg| {
            let arg = arg.replace('"', "");
            if arg.contains(char::is_whitespace) {
                format!("\"{arg}\"")
            } else {
                arg
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_file_names() {
        assert_eq!(file_name("WoW: 3.3.5a"), "WoW  3.3.5a");
        assert_eq!(file_name("  ..  "), "ZForge");
    }

    #[test]
    fn quotes_arguments_with_spaces() {
        let args = vec!["--realm".to_owned(), "Icecrown PvP".to_owned()];
        assert_eq!(join_arguments(&args), "--realm \"Icecrown PvP\"");
    }

    #[test]
    fn centers_icons_in_a_square() {
        let wide = DynamicImage::ImageRgba8(RgbaImage::new(512, 256));
        let icon = square_icon(&wide);
        assert_eq!((icon.width(), icon.height()), (ICON_SIZE, ICON_SIZE));
    }
}
