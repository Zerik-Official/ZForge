//! Addons installed in the `Interface\AddOns` folder of a game.

use serde::{Deserialize, Serialize};

/// An installed addon described by its `.toc` file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Addon {
    /// Folder name, which is also the name the game uses in `AddOns.txt`.
    pub folder: String,
    /// `## Title` without color codes, or the folder name.
    pub title: String,
    /// `## Notes` without color codes.
    pub notes: String,
    /// `## Author`.
    pub author: String,
    /// `## Version`.
    pub version: String,
    /// `## Interface`, the game version the addon was written for.
    pub interface: Option<u32>,
    /// Addons that must be installed and enabled.
    pub dependencies: Vec<String>,
    /// Addons used when they are present.
    pub optional_dependencies: Vec<String>,
    /// Required addons that are not installed.
    pub missing_dependencies: Vec<String>,
    /// The game loads it only when another addon asks for it.
    pub load_on_demand: bool,
    /// Whether the game loads it for the selected account or character.
    pub enabled: bool,
    /// The `## Interface` differs from the version of the game.
    pub outdated: bool,
}

/// Account, and optionally character, whose addon choices are read or written.
///
/// Without a character the account's `AddOns.txt` is used; with one, the
/// character's file, which the game creates when the addon list is changed for
/// that character.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonTarget {
    /// Folder name under `WTF\Account`.
    pub account: String,
    /// Realm folder of the character.
    pub realm: Option<String>,
    /// Character folder.
    pub character: Option<String>,
}

/// A realm folder of an account with its characters.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonRealm {
    /// Realm folder name.
    pub name: String,
    /// Character folder names.
    pub characters: Vec<String>,
}

/// An account folder under `WTF\Account` with its realms.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonAccount {
    /// Account folder name.
    pub name: String,
    /// Realms with characters.
    pub realms: Vec<AddonRealm>,
}
