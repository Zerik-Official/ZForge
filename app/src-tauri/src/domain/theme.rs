//! Installable launcher themes: the `theme.json` format.
//!
//! A theme is a folder with a `theme.json` and the images and fonts it
//! references by relative path. It can recolor the launcher, load fonts,
//! skin the shared controls with images and lay out settings categories like
//! the game panels. Every part is optional.

use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize};

/// Current version of the `theme.json` format.
pub const THEME_SCHEMA_VERSION: u32 = 1;

/// Identifier of the built-in theme, which has no folder.
pub const BUILT_IN_THEME_ID: &str = "dark";

/// Color tokens of the launcher a theme may override, without the leading `--`.
pub const COLOR_TOKENS: &[&str] = &[
    "bg",
    "bg-soft",
    "bg-card",
    "bg-elevated",
    "bg-hover",
    "bg-input",
    "border",
    "border-soft",
    "border-strong",
    "primary",
    "primary-hover",
    "primary-active",
    "on-primary",
    "primary-dim",
    "primary-soft",
    "primary-glow",
    "accent",
    "accent-dim",
    "accent-glow",
    "success",
    "warning",
    "danger",
    "info",
    "text",
    "text-soft",
    "muted",
    "muted-2",
    "muted-3",
    "scroll-track",
    "scroll-thumb",
    "scroll-thumb-hover",
];

/// An image drawn as is.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeImage {
    /// Path relative to the theme folder; absolute once resolved.
    pub file: String,
    /// Drawn width in pixels; the image width when absent.
    #[serde(default)]
    pub width: Option<f64>,
    /// Drawn height in pixels; the image height when absent.
    #[serde(default)]
    pub height: Option<f64>,
}

/// An image stretched as a nine-slice frame: corners keep their size, edges
/// and the center stretch.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeFrame {
    /// Path relative to the theme folder; absolute once resolved.
    pub file: String,
    /// Slice insets in image pixels: top, right, bottom, left.
    pub slice: [f64; 4],
    /// Drawn border widths in pixels; the slice insets when absent.
    #[serde(default)]
    pub border: Option<[f64; 4]>,
    /// Draw the center of the image too, not only the border.
    #[serde(default = "default_true")]
    pub fill: bool,
}

fn default_true() -> bool {
    true
}

/// Checkbox images.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckboxSkin {
    /// Empty box.
    #[serde(rename = "box")]
    pub box_image: ThemeImage,
    /// Check mark drawn over the box when checked.
    pub check: ThemeImage,
    /// Box while the pointer is over it.
    #[serde(default)]
    pub hover: Option<ThemeImage>,
    /// Check mark of a disabled checked box.
    #[serde(default)]
    pub check_disabled: Option<ThemeImage>,
}

/// Slider images.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SliderSkin {
    /// Track behind the thumb.
    pub track: ThemeFrame,
    /// Draggable thumb.
    pub thumb: ThemeImage,
}

/// Dropdown images.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectSkin {
    /// Closed dropdown and its list.
    pub frame: ThemeFrame,
    /// Arrow button on the right.
    #[serde(default)]
    pub arrow: Option<ThemeImage>,
}

/// Category tab images.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabSkin {
    /// Selected tab.
    pub active: ThemeFrame,
    /// Other tabs.
    pub inactive: ThemeFrame,
}

/// Images of the shared controls; each control is optional.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ThemeControls {
    /// Checkboxes.
    pub checkbox: Option<CheckboxSkin>,
    /// Sliders.
    pub slider: Option<SliderSkin>,
    /// Dropdowns.
    pub select: Option<SelectSkin>,
    /// Settings category tabs.
    pub tab: Option<TabSkin>,
    /// Frame of panels and layout sections.
    pub panel: Option<ThemeFrame>,
}

/// A font file loaded under a family name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeFont {
    /// Family name used by `typography`.
    pub family: String,
    /// Path relative to the theme folder; absolute once resolved.
    pub file: String,
}

/// Font families used by the launcher.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ThemeTypography {
    /// Family of regular text.
    pub body: Option<String>,
    /// Family of titles and labels.
    pub heading: Option<String>,
}

/// A setting placed on a layout.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutControl {
    /// Setting key from the settings schema.
    pub setting: String,
    /// Left position in layout pixels, relative to the section.
    pub x: f64,
    /// Top position in layout pixels, relative to the section.
    pub y: f64,
    /// Width in layout pixels.
    pub width: f64,
}

/// A titled box of a layout.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutSection {
    /// Title: a translation key of the launcher or literal text.
    #[serde(default)]
    pub title: Option<String>,
    /// Left position in layout pixels.
    pub x: f64,
    /// Top position in layout pixels.
    pub y: f64,
    /// Width in layout pixels.
    pub width: f64,
    /// Height in layout pixels.
    pub height: f64,
    /// Draw the panel frame around the section.
    #[serde(default = "default_true")]
    pub framed: bool,
    /// Settings placed in the section.
    #[serde(default)]
    pub controls: Vec<LayoutControl>,
}

/// Fixed-position arrangement of a settings category, scaled to fit.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeLayout {
    /// Canvas width in layout pixels.
    pub width: f64,
    /// Canvas height in layout pixels.
    pub height: f64,
    /// Boxes of the layout.
    pub sections: Vec<LayoutSection>,
}

/// The contents of `theme.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeManifest {
    /// Format version; must be [`THEME_SCHEMA_VERSION`].
    pub schema_version: u32,
    /// Folder name: lowercase letters, digits, `-` and `_`.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Author shown in the list.
    #[serde(default)]
    pub author: String,
    /// Theme version shown in the list.
    #[serde(default)]
    pub version: String,
    /// Short description.
    #[serde(default)]
    pub description: String,
    /// Launcher versions the theme supports, as a semver requirement such as
    /// `>=0.2.0` or `>=0.2.0, <=1.0.0`; any version when absent.
    #[serde(default)]
    pub requires: Option<String>,
    /// Icon shown in the list; an `icon.*` file in the theme folder when absent.
    #[serde(default)]
    pub icon: Option<String>,
    /// Screenshots shown in the theme details.
    #[serde(default)]
    pub previews: Vec<String>,
    /// Color overrides by token name (see [`COLOR_TOKENS`]).
    #[serde(default)]
    pub colors: BTreeMap<String, String>,
    /// Fonts to load.
    #[serde(default)]
    pub fonts: Vec<ThemeFont>,
    /// Families used for text.
    #[serde(default)]
    pub typography: ThemeTypography,
    /// Images of the shared controls.
    #[serde(default)]
    pub controls: ThemeControls,
    /// Layouts by settings category id, such as `graphics` or `effects`.
    #[serde(default)]
    pub layouts: BTreeMap<String, ThemeLayout>,
}

/// Why a theme cannot be used.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ThemeProblem {
    /// The folder has no `theme.json`.
    ManifestMissing,
    /// `theme.json` is larger than the launcher reads.
    ManifestTooLarge,
    /// `theme.json` is not valid JSON or a field has the wrong type.
    ManifestSyntax,
    /// `schemaVersion` is not supported.
    SchemaVersion,
    /// `id` has characters that are not allowed or is reserved.
    Id,
    /// `id` does not match the folder name.
    IdMismatch,
    /// `name` is empty or too long.
    Name,
    /// A color token is unknown or its value is not a color.
    Color,
    /// A font family name has characters that are not allowed.
    FontFamily,
    /// A layout has a size, position or setting that is not valid.
    Layout,
    /// `requires` is not a valid version requirement.
    Requires,
    /// A file path is empty, absolute or leaves the theme folder.
    FilePath,
    /// A referenced file does not exist.
    MissingFile,
    /// A referenced file has an extension that is not supported.
    UnsupportedFile,
    /// A BLP image could not be read or converted.
    BlpUnreadable,
    /// The zip has no `theme.json` at its root or in a single top folder.
    ArchiveMissingManifest,
    /// The zip has too many files.
    ArchiveTooManyFiles,
    /// The zip is too large once extracted.
    ArchiveTooLarge,
    /// The zip could not be read.
    ArchiveUnreadable,
    /// A file of the theme could not be read.
    Unreadable,
}

/// A problem found in a theme, with the field, file or position it concerns.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ThemeError {
    /// What is wrong.
    pub problem: ThemeProblem,
    /// The field, file, value or position concerned.
    pub detail: String,
}

impl ThemeError {
    /// A problem about a detail.
    pub fn new(problem: ThemeProblem, detail: impl Into<String>) -> Self {
        Self {
            problem,
            detail: detail.into(),
        }
    }
}

impl fmt::Display for ThemeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:?} ({})", self.problem, self.detail)
    }
}

/// A theme as listed in the launcher.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ThemeSummary {
    /// Folder name.
    pub id: String,
    /// Display name; the folder name when the theme is invalid.
    pub name: String,
    /// Author.
    pub author: String,
    /// Theme version.
    pub version: String,
    /// Short description.
    pub description: String,
    /// Absolute path of the icon, if any.
    pub icon: Option<String>,
    /// Absolute paths of the screenshots.
    pub previews: Vec<String>,
    /// Launcher versions the theme supports.
    pub requires: Option<String>,
    /// The running launcher satisfies `requires`.
    pub compatible: bool,
    /// Why the theme cannot be used, when it is invalid.
    pub error: Option<ThemeError>,
}

impl ThemeSummary {
    /// Summary of a loaded theme, checked against the running launcher version.
    pub fn new(manifest: &ThemeManifest, compatible: bool) -> Self {
        Self {
            id: manifest.id.clone(),
            name: manifest.name.clone(),
            author: manifest.author.clone(),
            version: manifest.version.clone(),
            description: manifest.description.clone(),
            icon: manifest.icon.clone(),
            previews: manifest.previews.clone(),
            requires: manifest.requires.clone(),
            compatible,
            error: None,
        }
    }
}

impl ThemeManifest {
    /// Every image path of the theme, for validation and resolution.
    pub fn image_files_mut(&mut self) -> Vec<&mut String> {
        let mut files: Vec<&mut String> = self.previews.iter_mut().collect();
        if let Some(icon) = self.icon.as_mut() {
            files.push(icon);
        }
        let controls = &mut self.controls;
        if let Some(checkbox) = controls.checkbox.as_mut() {
            files.push(&mut checkbox.box_image.file);
            files.push(&mut checkbox.check.file);
            if let Some(hover) = checkbox.hover.as_mut() {
                files.push(&mut hover.file);
            }
            if let Some(disabled) = checkbox.check_disabled.as_mut() {
                files.push(&mut disabled.file);
            }
        }
        if let Some(slider) = controls.slider.as_mut() {
            files.push(&mut slider.track.file);
            files.push(&mut slider.thumb.file);
        }
        if let Some(select) = controls.select.as_mut() {
            files.push(&mut select.frame.file);
            if let Some(arrow) = select.arrow.as_mut() {
                files.push(&mut arrow.file);
            }
        }
        if let Some(tab) = controls.tab.as_mut() {
            files.push(&mut tab.active.file);
            files.push(&mut tab.inactive.file);
        }
        if let Some(panel) = controls.panel.as_mut() {
            files.push(&mut panel.file);
        }
        files
    }
}
