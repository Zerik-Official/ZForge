//! Installed themes: listing, validation, importing from a zip and resolving
//! the active one for the frontend.
//!
//! Themes live in `<app_data_dir>/themes/<id>/theme.json`. Users can drop a
//! folder there or import a zip that has `theme.json` at its root or inside a
//! single top folder.

use std::fs::{self, File};
use std::path::{Path, PathBuf};

use image::ImageFormat;
use semver::{Version, VersionReq};
use uuid::Uuid;
use wow_blp::convert::blp_to_image;
use wow_blp::parser::load_blp;

use crate::domain::theme::{
    BUILT_IN_THEME_ID, COLOR_TOKENS, THEME_SCHEMA_VERSION, ThemeError, ThemeLayout, ThemeManifest,
    ThemeProblem, ThemeSummary,
};
use crate::error::{AppError, AppResult};

/// Name of the manifest inside a theme folder.
pub const MANIFEST_FILE: &str = "theme.json";

/// Largest zip the launcher extracts, uncompressed.
const MAX_ARCHIVE_BYTES: u64 = 64 * 1024 * 1024;

/// Most entries a theme zip may have.
const MAX_ARCHIVE_ENTRIES: usize = 2000;

/// Largest `theme.json` the launcher reads.
const MAX_MANIFEST_BYTES: u64 = 512 * 1024;

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "blp"];

/// Folder inside a theme where BLP images are converted to PNG.
const CACHE_DIR: &str = ".cache";

/// Name of the icon file looked up when `icon` is not set, without extension.
const ICON_STEM: &str = "icon";

/// Version of the running launcher, compared with `requires`.
pub const LAUNCHER_VERSION: &str = env!("CARGO_PKG_VERSION");
const FONT_EXTENSIONS: &[&str] = &["ttf", "otf", "woff", "woff2"];

fn invalid(problem: ThemeProblem, detail: impl Into<String>) -> AppError {
    AppError::ThemeInvalid(ThemeError::new(problem, detail))
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id != BUILT_IN_THEME_ID
        && id.chars().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || character == '-'
                || character == '_'
        })
}

fn valid_color(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && !value.to_ascii_lowercase().contains("url")
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "#(),.% -".contains(character))
}

fn valid_family(family: &str) -> bool {
    !family.is_empty()
        && family.len() <= 64
        && family
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || " _-".contains(character))
}

fn valid_number(value: f64) -> bool {
    value.is_finite() && (0.0..=10_000.0).contains(&value)
}

fn validate_layout(category: &str, layout: &ThemeLayout) -> AppResult<()> {
    let sizes_ok = valid_number(layout.width)
        && valid_number(layout.height)
        && layout.width > 0.0
        && layout.height > 0.0;
    if category.is_empty() || !sizes_ok {
        return Err(invalid(ThemeProblem::Layout, category));
    }
    for section in &layout.sections {
        let numbers = [section.x, section.y, section.width, section.height];
        if !numbers.into_iter().all(valid_number) {
            return Err(invalid(
                ThemeProblem::Layout,
                format!(
                    "{category}: {}",
                    section.title.as_deref().unwrap_or("section")
                ),
            ));
        }
        for control in &section.controls {
            let numbers = [control.x, control.y, control.width];
            if control.setting.trim().is_empty() || !numbers.into_iter().all(valid_number) {
                return Err(invalid(
                    ThemeProblem::Layout,
                    format!("{category}: {}", control.setting),
                ));
            }
        }
    }
    Ok(())
}

/// Check everything in a manifest except the referenced files.
///
/// # Errors
///
/// Returns [`AppError::ThemeInvalid`] naming the first problem found.
pub fn validate_manifest(manifest: &ThemeManifest) -> AppResult<()> {
    if manifest.schema_version != THEME_SCHEMA_VERSION {
        return Err(invalid(
            ThemeProblem::SchemaVersion,
            manifest.schema_version.to_string(),
        ));
    }
    if !valid_id(&manifest.id) {
        return Err(invalid(ThemeProblem::Id, manifest.id.clone()));
    }
    if manifest.name.trim().is_empty() || manifest.name.len() > 80 {
        return Err(invalid(ThemeProblem::Name, manifest.name.clone()));
    }
    for (token, value) in &manifest.colors {
        if !COLOR_TOKENS.contains(&token.as_str()) || !valid_color(value) {
            return Err(invalid(ThemeProblem::Color, token.clone()));
        }
    }
    let families = manifest
        .fonts
        .iter()
        .map(|font| font.family.as_str())
        .chain(manifest.typography.body.as_deref())
        .chain(manifest.typography.heading.as_deref());
    for family in families {
        if !valid_family(family) {
            return Err(invalid(ThemeProblem::FontFamily, family));
        }
    }
    for (category, layout) in &manifest.layouts {
        validate_layout(category, layout)?;
    }
    if let Some(requires) = &manifest.requires {
        parse_requirement(requires)?;
    }
    Ok(())
}

fn parse_requirement(requires: &str) -> AppResult<VersionReq> {
    VersionReq::parse(requires.trim()).map_err(|_| invalid(ThemeProblem::Requires, requires))
}

/// Whether a launcher version satisfies the theme requirement; any version
/// does when the theme sets none.
pub fn is_compatible(manifest: &ThemeManifest, launcher_version: &str) -> bool {
    let Some(requires) = &manifest.requires else {
        return true;
    };
    match (
        parse_requirement(requires),
        Version::parse(launcher_version),
    ) {
        (Ok(requirement), Ok(version)) => requirement.matches(&version),
        _ => false,
    }
}

/// PNG copy of a BLP image in the theme cache, converted again when the BLP changes.
fn blp_as_png(root: &Path, blp: &Path) -> AppResult<PathBuf> {
    let relative = blp
        .strip_prefix(root)
        .map_err(|_| invalid(ThemeProblem::FilePath, blp.to_string_lossy()))?;
    let shown = relative.to_string_lossy().replace('\\', "/");
    let unreadable = || invalid(ThemeProblem::BlpUnreadable, shown.clone());
    let name: String = relative
        .to_string_lossy()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect();
    let cache = root.join(CACHE_DIR);
    let png = cache.join(format!("{name}.png"));
    let fresh = match (
        fs::metadata(&png).and_then(|meta| meta.modified()),
        fs::metadata(blp).and_then(|meta| meta.modified()),
    ) {
        (Ok(converted), Ok(source)) => converted >= source,
        _ => false,
    };
    if !fresh {
        let texture = load_blp(blp).map_err(|_| unreadable())?;
        let image = blp_to_image(&texture, 0).map_err(|_| unreadable())?;
        fs::create_dir_all(&cache)?;
        image
            .save_with_format(&png, ImageFormat::Png)
            .map_err(|_| unreadable())?;
    }
    Ok(png)
}

/// An image the webview can show: BLP images are converted to PNG.
fn resolve_image(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let path = resolve_file(root, relative, IMAGE_EXTENSIONS)?;
    if has_extension(&path, &["blp"]) {
        blp_as_png(root, &path)
    } else {
        Ok(path)
    }
}

/// The `icon.*` file of a theme folder, if any.
fn find_icon(root: &Path) -> Option<String> {
    IMAGE_EXTENSIONS
        .iter()
        .map(|extension| format!("{ICON_STEM}.{extension}"))
        .find(|name| root.join(name).is_file())
}

fn has_extension(path: &Path, allowed: &[&str]) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| allowed.contains(&extension.to_ascii_lowercase().as_str()))
}

/// A canonical path as the webview expects it, without the verbatim prefix Windows adds.
fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with(r"UNC\") => rest.to_owned(),
        _ => text.into_owned(),
    }
}

/// Absolute path of a theme file, refusing anything outside the theme folder.
fn resolve_file(root: &Path, relative: &str, allowed: &[&str]) -> AppResult<PathBuf> {
    let relative_path = Path::new(relative);
    if relative.trim().is_empty() || relative_path.is_absolute() {
        return Err(invalid(ThemeProblem::FilePath, relative));
    }
    if !has_extension(relative_path, allowed) {
        return Err(invalid(ThemeProblem::UnsupportedFile, relative));
    }
    let candidate = root
        .join(relative_path)
        .canonicalize()
        .map_err(|_| invalid(ThemeProblem::MissingFile, relative))?;
    if !candidate.starts_with(root) || !candidate.is_file() {
        return Err(invalid(ThemeProblem::FilePath, relative));
    }
    Ok(candidate)
}

/// Read and fully validate the theme in a folder, with its file paths made absolute.
///
/// # Errors
///
/// Returns [`AppError::ThemeInvalid`] when the manifest or a file is invalid,
/// and I/O or JSON errors when it cannot be read.
pub fn load(folder: &Path) -> AppResult<ThemeManifest> {
    let root = folder.canonicalize()?;
    let manifest_path = root.join(MANIFEST_FILE);
    let size = fs::metadata(&manifest_path)
        .map_err(|_| invalid(ThemeProblem::ManifestMissing, MANIFEST_FILE))?
        .len();
    if size > MAX_MANIFEST_BYTES {
        return Err(invalid(ThemeProblem::ManifestTooLarge, MANIFEST_FILE));
    }
    let mut manifest: ThemeManifest =
        serde_json::from_slice(&fs::read(&manifest_path)?).map_err(|error| {
            invalid(
                ThemeProblem::ManifestSyntax,
                format!("{}:{}", error.line(), error.column()),
            )
        })?;
    validate_manifest(&manifest)?;
    if manifest.icon.is_none() {
        manifest.icon = find_icon(&root);
    }
    for font in &mut manifest.fonts {
        font.file = display_path(&resolve_file(&root, &font.file, FONT_EXTENSIONS)?);
    }
    for file in manifest.image_files_mut() {
        *file = display_path(&resolve_image(&root, file)?);
    }
    Ok(manifest)
}

/// Every theme folder, valid or not, sorted by name.
///
/// # Errors
///
/// Fails when the themes directory cannot be read.
pub fn list(themes_dir: &Path) -> AppResult<Vec<ThemeSummary>> {
    if !themes_dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut themes = Vec::new();
    for entry in fs::read_dir(themes_dir)? {
        let path = entry?.path();
        let Some(folder) = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_owned)
        else {
            continue;
        };
        if !path.is_dir() || folder.starts_with('.') {
            continue;
        }
        let summary = match load(&path) {
            Ok(manifest) if manifest.id == folder => {
                ThemeSummary::new(&manifest, is_compatible(&manifest, LAUNCHER_VERSION))
            }
            Ok(manifest) => broken(
                &folder,
                ThemeError::new(ThemeProblem::IdMismatch, manifest.id),
            ),
            Err(AppError::ThemeInvalid(error)) => broken(&folder, error),
            Err(error) => broken(
                &folder,
                ThemeError::new(ThemeProblem::Unreadable, error.to_string()),
            ),
        };
        themes.push(summary);
    }
    themes.sort_by_key(|theme| theme.name.to_lowercase());
    Ok(themes)
}

fn broken(folder: &str, error: ThemeError) -> ThemeSummary {
    tracing::warn!(theme = folder, %error, "Theme is invalid");
    ThemeSummary {
        id: folder.to_owned(),
        name: folder.to_owned(),
        author: String::new(),
        version: String::new(),
        description: String::new(),
        icon: None,
        previews: Vec::new(),
        requires: None,
        compatible: false,
        error: Some(error),
    }
}

/// The active theme with absolute file paths, or `None` for the built-in one.
///
/// A missing or invalid theme falls back to the built-in one.
pub fn active(themes_dir: &Path, id: &str) -> Option<ThemeManifest> {
    if id.is_empty() || id == BUILT_IN_THEME_ID || !valid_id(id) {
        return None;
    }
    match load(&themes_dir.join(id)) {
        Ok(manifest) if manifest.id == id && is_compatible(&manifest, LAUNCHER_VERSION) => {
            Some(manifest)
        }
        Ok(_) => None,
        Err(error) => {
            tracing::warn!(%error, theme = id, "Active theme could not be loaded");
            None
        }
    }
}

/// Find the folder holding `theme.json` in an extracted archive.
fn extracted_root(staging: &Path) -> AppResult<PathBuf> {
    if staging.join(MANIFEST_FILE).is_file() {
        return Ok(staging.to_path_buf());
    }
    let folders: Vec<PathBuf> = fs::read_dir(staging)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    match folders.as_slice() {
        [folder] if folder.join(MANIFEST_FILE).is_file() => Ok(folder.clone()),
        _ => Err(invalid(ThemeProblem::ArchiveMissingManifest, MANIFEST_FILE)),
    }
}

fn check_archive(archive: &mut zip::ZipArchive<File>) -> AppResult<()> {
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(invalid(
            ThemeProblem::ArchiveTooManyFiles,
            archive.len().to_string(),
        ));
    }
    let mut total: u64 = 0;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| invalid(ThemeProblem::ArchiveUnreadable, error.to_string()))?;
        if entry.enclosed_name().is_none() {
            return Err(invalid(
                ThemeProblem::FilePath,
                entry.name_raw().escape_ascii().to_string(),
            ));
        }
        total = total.saturating_add(entry.size());
    }
    if total > MAX_ARCHIVE_BYTES {
        return Err(invalid(
            ThemeProblem::ArchiveTooLarge,
            format!("{} MiB", total / (1024 * 1024)),
        ));
    }
    Ok(())
}

/// Install a theme from a zip, replacing an installed theme with the same id.
///
/// # Errors
///
/// Returns [`AppError::ThemeInvalid`] when the archive or its theme is invalid.
pub fn import(themes_dir: &Path, archive_path: &Path) -> AppResult<ThemeSummary> {
    fs::create_dir_all(themes_dir)?;
    let staging = themes_dir.join(format!(".import-{}", Uuid::new_v4()));
    let result = import_into(themes_dir, archive_path, &staging);
    if staging.exists()
        && let Err(error) = fs::remove_dir_all(&staging)
    {
        tracing::warn!(%error, "Could not remove the theme import folder");
    }
    result
}

fn import_into(themes_dir: &Path, archive_path: &Path, staging: &Path) -> AppResult<ThemeSummary> {
    let unreadable =
        |error: zip::result::ZipError| invalid(ThemeProblem::ArchiveUnreadable, error.to_string());
    let mut archive = zip::ZipArchive::new(File::open(archive_path)?).map_err(unreadable)?;
    check_archive(&mut archive)?;
    fs::create_dir_all(staging)?;
    archive.extract(staging).map_err(unreadable)?;
    let root = extracted_root(staging)?;
    let manifest = load(&root)?;
    let destination = themes_dir.join(&manifest.id);
    if destination.exists() {
        fs::remove_dir_all(&destination)?;
    }
    fs::rename(&root, &destination)?;
    tracing::info!(theme = %manifest.id, "Theme imported");
    let compatible = is_compatible(&manifest, LAUNCHER_VERSION);
    Ok(ThemeSummary::new(&manifest, compatible))
}

/// Delete an installed theme folder; a no-op when it does not exist.
///
/// # Errors
///
/// Returns [`AppError::ThemeInvalid`] for an id that is not a theme folder name.
pub fn delete(themes_dir: &Path, id: &str) -> AppResult<()> {
    if !valid_id(id) {
        return Err(invalid(ThemeProblem::Id, id));
    }
    let folder = themes_dir.join(id);
    if folder.is_dir() {
        fs::remove_dir_all(&folder)?;
        tracing::info!(theme = id, "Theme deleted");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use zip::write::SimpleFileOptions;

    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";

    fn manifest_json(id: &str) -> String {
        format!(
            r##"{{
                "schemaVersion": 1,
                "id": "{id}",
                "name": "Golden",
                "colors": {{ "primary": "#c8a24a", "bg": "rgba(0, 0, 0, 0.9)" }},
                "fonts": [{{ "family": "Friz Quadrata", "file": "fonts/friz.ttf" }}],
                "typography": {{ "heading": "Friz Quadrata" }},
                "controls": {{
                    "checkbox": {{ "box": {{ "file": "img/box.png" }}, "check": {{ "file": "img/check.png", "width": 20 }} }},
                    "panel": {{ "file": "img/panel.png", "slice": [8, 8, 8, 8] }}
                }},
                "layouts": {{
                    "graphics": {{ "width": 600, "height": 400, "sections": [
                        {{ "title": "settings.categories.graphics", "x": 10, "y": 10, "width": 280, "height": 200,
                           "controls": [{{ "setting": "resolution", "x": 12, "y": 30, "width": 200 }}] }}
                    ] }}
                }}
            }}"##
        )
    }

    fn write_theme(folder: &Path, id: &str) -> AppResult<()> {
        fs::create_dir_all(folder.join("img"))?;
        fs::create_dir_all(folder.join("fonts"))?;
        fs::write(folder.join(MANIFEST_FILE), manifest_json(id))?;
        for image in ["img/box.png", "img/check.png", "img/panel.png"] {
            fs::write(folder.join(image), PNG)?;
        }
        fs::write(folder.join("fonts/friz.ttf"), b"font")?;
        Ok(())
    }

    #[test]
    fn loads_valid_themes_with_absolute_paths() -> AppResult<()> {
        let dir = tempfile::tempdir()?;
        let folder = dir.path().join("golden");
        write_theme(&folder, "golden")?;
        let manifest = load(&folder)?;
        let root = PathBuf::from(display_path(&folder.canonicalize()?));
        let check = manifest
            .controls
            .checkbox
            .as_ref()
            .map(|checkbox| PathBuf::from(&checkbox.check.file));
        assert_eq!(check, Some(root.join("img").join("check.png")));
        assert_eq!(
            manifest.fonts.first().map(|font| PathBuf::from(&font.file)),
            Some(root.join("fonts").join("friz.ttf"))
        );
        assert_eq!(
            list(dir.path())?.first().map(|theme| theme.error.clone()),
            Some(None)
        );
        assert_eq!(
            active(dir.path(), "golden").map(|theme| theme.name),
            Some("Golden".to_owned())
        );
        assert_eq!(active(dir.path(), BUILT_IN_THEME_ID), None);
        Ok(())
    }

    #[test]
    fn rejects_unsafe_or_broken_themes() -> AppResult<()> {
        let dir = tempfile::tempdir()?;
        let folder = dir.path().join("golden");
        write_theme(&folder, "golden")?;

        let escaping = manifest_json("golden").replace("img/panel.png", "../outside.png");
        fs::write(dir.path().join("outside.png"), PNG)?;
        fs::write(folder.join(MANIFEST_FILE), escaping)?;
        assert!(matches!(load(&folder), Err(AppError::ThemeInvalid(_))));

        let script = manifest_json("golden").replace("#c8a24a", "url(javascript:x)");
        fs::write(folder.join(MANIFEST_FILE), script)?;
        assert!(matches!(load(&folder), Err(AppError::ThemeInvalid(_))));

        let token = manifest_json("golden").replace("\"primary\"", "\"--evil\"");
        fs::write(folder.join(MANIFEST_FILE), token)?;
        assert!(matches!(load(&folder), Err(AppError::ThemeInvalid(_))));

        fs::write(folder.join(MANIFEST_FILE), manifest_json("other"))?;
        let listed = list(dir.path())?;
        assert!(listed.first().is_some_and(|theme| theme.error.is_some()));
        assert_eq!(active(dir.path(), "golden"), None);
        assert!(matches!(
            delete(dir.path(), "../x"),
            Err(AppError::ThemeInvalid(_))
        ));
        Ok(())
    }

    #[test]
    fn imports_zips_with_a_top_folder_and_replaces_them() -> AppResult<()> {
        let dir = tempfile::tempdir()?;
        let source = dir.path().join("source");
        write_theme(&source, "golden")?;
        let archive_path = dir.path().join("golden.zip");
        let mut writer = zip::ZipWriter::new(File::create(&archive_path)?);
        for relative in [
            MANIFEST_FILE,
            "img/box.png",
            "img/check.png",
            "img/panel.png",
            "fonts/friz.ttf",
        ] {
            writer.start_file(
                format!("golden-theme/{relative}"),
                SimpleFileOptions::default(),
            )?;
            writer.write_all(&fs::read(source.join(relative))?)?;
        }
        writer.finish()?;

        let themes = dir.path().join("themes");
        let summary = import(&themes, &archive_path)?;
        assert_eq!(summary.id, "golden");
        assert!(fs::read_to_string(themes.join("golden").join(MANIFEST_FILE))?.contains("Golden"));
        import(&themes, &archive_path)?;
        assert_eq!(list(&themes)?.len(), 1);

        delete(&themes, "golden")?;
        assert!(list(&themes)?.is_empty());
        Ok(())
    }

    #[test]
    fn checks_the_launcher_version() -> AppResult<()> {
        let dir = tempfile::tempdir()?;
        let folder = dir.path().join("golden");
        write_theme(&folder, "golden")?;
        let mut manifest = load(&folder)?;
        assert!(is_compatible(&manifest, "0.1.0"));
        manifest.requires = Some("<=1.0.0".to_owned());
        assert!(is_compatible(&manifest, "1.0.0"));
        assert!(!is_compatible(&manifest, "1.0.1"));
        manifest.requires = Some(">=0.2.0, <=1.0.0".to_owned());
        assert!(!is_compatible(&manifest, "0.1.9"));
        assert!(is_compatible(&manifest, "0.5.0"));

        let broken = manifest_json("golden").replace(
            "\"schemaVersion\": 1,",
            "\"schemaVersion\": 1, \"requires\": \"soon\",",
        );
        fs::write(folder.join(MANIFEST_FILE), broken)?;
        assert!(matches!(load(&folder), Err(AppError::ThemeInvalid(_))));

        let future = manifest_json("golden").replace(
            "\"schemaVersion\": 1,",
            "\"schemaVersion\": 1, \"requires\": \">=99.0.0\",",
        );
        fs::write(folder.join(MANIFEST_FILE), future)?;
        assert_eq!(
            list(dir.path())?.first().map(|theme| theme.compatible),
            Some(false)
        );
        assert_eq!(active(dir.path(), "golden"), None);
        Ok(())
    }

    #[test]
    fn finds_icons_and_converts_blp_images() -> AppResult<()> {
        let dir = tempfile::tempdir()?;
        let folder = dir.path().join("golden");
        write_theme(&folder, "golden")?;
        fs::write(folder.join("icon.png"), PNG)?;

        let source = image::DynamicImage::new_rgba8(4, 4);
        let blp = wow_blp::convert::image_to_blp(
            source,
            false,
            wow_blp::convert::BlpTarget::Blp1(wow_blp::convert::BlpOldFormat::Raw1 {
                alpha_bits: wow_blp::convert::AlphaBits::Bit8,
            }),
            wow_blp::convert::FilterType::Nearest,
        )
        .map_err(|_| invalid(ThemeProblem::BlpUnreadable, "test"))?;
        wow_blp::encode::save_blp(&blp, folder.join("img/preview.blp"))
            .map_err(|_| invalid(ThemeProblem::BlpUnreadable, "test"))?;
        let with_preview = manifest_json("golden").replace(
            "\"schemaVersion\": 1,",
            "\"schemaVersion\": 1, \"previews\": [\"img/preview.blp\"],",
        );
        fs::write(folder.join(MANIFEST_FILE), with_preview)?;

        let manifest = load(&folder)?;
        let root = PathBuf::from(display_path(&folder.canonicalize()?));
        assert_eq!(
            manifest.icon.map(PathBuf::from),
            Some(root.join("icon.png"))
        );
        let preview = manifest.previews.first().map(PathBuf::from);
        assert_eq!(
            preview,
            Some(root.join(CACHE_DIR).join("img_preview_blp.png"))
        );
        assert!(preview.is_some_and(|path| image::open(path).is_ok()));
        Ok(())
    }

    #[test]
    fn the_documented_example_theme_is_valid() -> AppResult<()> {
        let example = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../docs/themes/example");
        let manifest = load(&example)?;
        assert_eq!(manifest.id, "example-gold");
        assert!(manifest.layouts.contains_key("graphics"));
        assert!(manifest.layouts.contains_key("effects"));
        Ok(())
    }
}
