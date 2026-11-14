//! Bundled media catalogue and user-provided custom assets.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;

include!(concat!(env!("OUT_DIR"), "/bundled_assets.rs"));

/// Default media for one expansion.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct ExpansionMedia {
    /// Display name.
    pub name: &'static str,
    /// Background video.
    pub video: &'static str,
    /// Logo.
    pub poster: &'static str,
    /// Dock icon.
    pub icon: &'static str,
    /// Box art.
    #[serde(rename = "box")]
    pub box_art: &'static str,
}

const EXPANSIONS: &[(&str, ExpansionMedia)] = &[
    (
        "classic",
        ExpansionMedia {
            name: "World of Warcraft Classic",
            video: "/assets/games/scenes/classic/wow_classic_portal.mp4",
            poster: "/assets/games/logos/classic/wow_classic_blue.webp",
            icon: "/assets/games/icos/classic/ico/wow_classic.ico",
            box_art: "/assets/games/boxes/wow_box_classic.png",
        },
    ),
    (
        "tbc",
        ExpansionMedia {
            name: "The Burning Crusade",
            video: "/assets/games/scenes/burning/wow_bc_dark_portal.mp4",
            poster: "/assets/games/logos/burning/wow_burning_crusade.webp",
            icon: "/assets/games/icos/burning/ico/wow_bc.ico",
            box_art: "/assets/games/boxes/wow_tbc_box.png",
        },
    ),
    (
        "wotlk",
        ExpansionMedia {
            name: "Wrath of the Lich King",
            video: "/assets/games/scenes/wotlk/wow_lich_king_sword.mp4",
            poster: "/assets/games/logos/wotlk/wow_wotlk.webp",
            icon: "/assets/games/icos/wotlk/png/wtlk_alter.png",
            box_art: "/assets/games/boxes/wow_wotlk_box.png",
        },
    ),
];

/// Default media for an expansion key, if the expansion is known.
pub fn expansion_media(expansion: &str) -> Option<&'static ExpansionMedia> {
    EXPANSIONS
        .iter()
        .find(|(key, _)| *key == expansion)
        .map(|(_, media)| media)
}

/// Every selectable bundled media file, grouped for the add/edit game modal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AssetManifest {
    /// Default media per expansion key.
    pub expansions: BTreeMap<&'static str, ExpansionMedia>,
    /// Background videos.
    pub available_videos: Vec<&'static str>,
    /// Logos.
    pub available_posters: Vec<&'static str>,
    /// Dock icons.
    pub available_icons: Vec<&'static str>,
    /// Box art.
    pub available_boxes: Vec<&'static str>,
}

fn bundled(kind: &str, extensions: &[&str]) -> Vec<&'static str> {
    let prefix = format!("/assets/games/{kind}/");
    BUNDLED_ASSET_URLS
        .iter()
        .copied()
        .filter(|url| url.starts_with(&prefix))
        .filter(|url| {
            Path::new(url)
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| {
                    extensions
                        .iter()
                        .any(|allowed| extension.eq_ignore_ascii_case(allowed))
                })
        })
        .collect()
}

/// Build the bundled asset manifest.
pub fn manifest() -> AssetManifest {
    AssetManifest {
        expansions: EXPANSIONS.iter().copied().collect(),
        available_videos: bundled("scenes", &["mp4"]),
        available_posters: bundled("logos", &["png", "webp"]),
        available_icons: bundled("icos", &["ico", "png"]),
        available_boxes: bundled("boxes", &["png"]),
    }
}

/// Kinds of user-provided media the launcher accepts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CustomAssetKind {
    /// Dock icons.
    Icos,
    /// Logos.
    Logos,
    /// Background videos.
    Scenes,
}

impl CustomAssetKind {
    /// Folder name under the custom assets directory.
    pub fn folder(self) -> &'static str {
        match self {
            Self::Icos => "icos",
            Self::Logos => "logos",
            Self::Scenes => "scenes",
        }
    }

    /// File-dialog filter name and accepted extensions.
    pub fn dialog_filter(self) -> (&'static str, &'static [&'static str]) {
        match self {
            Self::Icos => ("Icon", &["ico", "png"]),
            Self::Logos => ("Image", &["png", "jpg", "jpeg", "webp"]),
            Self::Scenes => ("Video", &["mp4", "webm"]),
        }
    }
}

/// Copy a user-selected file into the custom assets folder, replacing a file
/// with the same name.
///
/// # Errors
///
/// Fails when the source has no file name or the copy fails.
pub fn import_custom_asset(
    paths: &AppPaths,
    kind: CustomAssetKind,
    source: &Path,
) -> AppResult<PathBuf> {
    let file_name = source.file_name().ok_or_else(|| {
        AppError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("source has no file name: {}", source.display()),
        ))
    })?;
    let directory = paths.custom_assets_dir(kind.folder());
    fs::create_dir_all(&directory)?;
    let destination = directory.join(file_name);
    fs::copy(source, &destination)?;
    tracing::info!(destination = %destination.display(), "Imported custom asset");
    Ok(destination)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_contains_expansion_defaults() {
        let manifest = manifest();
        for (_, media) in EXPANSIONS {
            assert!(manifest.available_boxes.contains(&media.box_art));
            assert!(manifest.available_videos.contains(&media.video));
        }
        assert!(expansion_media("wotlk").is_some());
        assert!(expansion_media("unknown").is_none());
    }

    #[test]
    fn imports_custom_assets() -> AppResult<()> {
        let directory = tempfile::tempdir()?;
        let source = directory.path().join("icon.png");
        fs::write(&source, b"png")?;
        let paths = AppPaths::from_root(directory.path().join("data"));
        let imported = import_custom_asset(&paths, CustomAssetKind::Icos, &source)?;
        assert_eq!(imported, paths.custom_assets_dir("icos").join("icon.png"));
        assert_eq!(fs::read(imported)?, b"png");
        Ok(())
    }
}
