//! Addon management: read `.toc` files, enable or disable addons in
//! `AddOns.txt`, install addon archives and delete addon folders.
//!
//! `AddOns.txt` is rewritten line by line: lines of other addons keep their
//! bytes and line endings.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::domain::addon::{Addon, AddonAccount, AddonRealm, AddonTarget};
use crate::error::{AppError, AppResult};

const ADDONS_FILE: &str = "AddOns.txt";
const SAVED_VARIABLES: &str = "SavedVariables";
const STAGING_PREFIX: &str = ".zforge-import-";
const MAX_ARCHIVE_ENTRIES: usize = 50_000;
const MAX_ARCHIVE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_ADDON_DEPTH: usize = 4;
const CRLF: &[u8] = b"\r\n";
const LF: &[u8] = b"\n";

/// `Interface\AddOns` folder of a game installation.
pub fn addons_dir(game_root: &Path) -> PathBuf {
    game_root.join("Interface").join("AddOns")
}

/// `## Interface` value of a game expansion, when the launcher knows it.
pub fn interface_version(expansion: &str) -> Option<u32> {
    match expansion {
        "classic" => Some(11200),
        "tbc" => Some(20400),
        "wotlk" => Some(30300),
        _ => None,
    }
}

/// Whether a name can be used as a single folder or file name.
fn valid_name(name: &str) -> bool {
    !name.trim().is_empty()
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])
}

fn checked_name(name: &str) -> AppResult<&str> {
    if valid_name(name) {
        Ok(name)
    } else {
        Err(AppError::AddonNameInvalid(name.to_owned()))
    }
}

/// Text without WoW color codes (`|cAARRGGBB` and `|r`).
fn strip_colors(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(current) = chars.next() {
        if current == '|' {
            match chars.peek() {
                Some('c' | 'C') => {
                    chars.next();
                    for _ in 0..8 {
                        chars.next();
                    }
                    continue;
                }
                Some('r' | 'R') => {
                    chars.next();
                    continue;
                }
                _ => {}
            }
        }
        result.push(current);
    }
    result.trim().to_owned()
}

fn split_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .collect()
}

/// Fields read from a `.toc` file.
#[derive(Debug, Default, PartialEq, Eq)]
struct TocInfo {
    title: String,
    notes: String,
    author: String,
    version: String,
    interface: Option<u32>,
    dependencies: Vec<String>,
    optional_dependencies: Vec<String>,
    load_on_demand: bool,
    default_disabled: bool,
}

fn parse_toc(text: &str) -> TocInfo {
    let mut info = TocInfo::default();
    for line in text.lines() {
        let Some(rest) = line.trim().strip_prefix("##") else {
            continue;
        };
        let Some((key, value)) = rest.split_once(':') else {
            continue;
        };
        let value = value.trim();
        match key.trim().to_ascii_lowercase().as_str() {
            "title" => info.title = strip_colors(value),
            "notes" => info.notes = strip_colors(value),
            "author" => info.author = strip_colors(value),
            "version" => info.version = value.to_owned(),
            "interface" => info.interface = value.parse().ok(),
            "dependencies" | "requireddeps" => info.dependencies.extend(split_list(value)),
            "optionaldeps" => info.optional_dependencies.extend(split_list(value)),
            "loadondemand" => info.load_on_demand = value == "1",
            "defaultstate" => info.default_disabled = value.eq_ignore_ascii_case("disabled"),
            other if other.starts_with("dep") => info.dependencies.extend(split_list(value)),
            _ => {}
        }
    }
    info
}

fn read_toc(folder: &Path, name: &str) -> AppResult<Option<TocInfo>> {
    match fs::read(folder.join(format!("{name}.toc"))) {
        Ok(bytes) => {
            let text = String::from_utf8_lossy(&bytes);
            Ok(Some(parse_toc(text.trim_start_matches('\u{feff}'))))
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// `AddOns.txt` of the account, or of the character when the target names one.
fn addons_file(game_root: &Path, target: &AddonTarget) -> AppResult<PathBuf> {
    let mut path = game_root
        .join("WTF")
        .join("Account")
        .join(checked_name(&target.account)?);
    if let (Some(realm), Some(character)) = (&target.realm, &target.character) {
        path = path
            .join(checked_name(realm)?)
            .join(checked_name(character)?);
    }
    Ok(path.join(ADDONS_FILE))
}

fn account_file(game_root: &Path, target: &AddonTarget) -> AppResult<PathBuf> {
    addons_file(
        game_root,
        &AddonTarget {
            account: target.account.clone(),
            realm: None,
            character: None,
        },
    )
}

fn read_bytes(path: &Path) -> AppResult<Vec<u8>> {
    match fs::read(path) {
        Ok(bytes) => Ok(bytes),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.into()),
    }
}

/// Name and state of an `AddOns.txt` line such as `Bagnon: enabled`.
fn parse_state_line(line: &[u8]) -> Option<(String, bool)> {
    let text = String::from_utf8_lossy(line);
    let (name, state) = text.trim().split_once(':')?;
    let enabled = match state.trim().to_ascii_lowercase().as_str() {
        "enabled" => true,
        "disabled" => false,
        _ => return None,
    };
    Some((name.trim().to_ascii_lowercase(), enabled))
}

fn read_states(path: &Path) -> AppResult<HashMap<String, bool>> {
    Ok(read_bytes(path)?
        .split(|byte| *byte == b'\n')
        .filter_map(parse_state_line)
        .collect())
}

fn write_states(path: &Path, changes: &[(String, bool)]) -> AppResult<()> {
    let bytes = read_bytes(path)?;
    let newline = if bytes.is_empty() || bytes.windows(2).any(|pair| pair == CRLF) {
        CRLF
    } else {
        LF
    };
    let mut lines: Vec<Vec<u8>> = bytes
        .split_inclusive(|byte| *byte == b'\n')
        .map(<[u8]>::to_vec)
        .collect();

    for (folder, enabled) in changes {
        let state = if *enabled { "enabled" } else { "disabled" };
        let mut content = format!("{folder}: {state}").into_bytes();
        let key = folder.to_ascii_lowercase();
        let existing = lines
            .iter()
            .position(|line| parse_state_line(line).is_some_and(|(name, _)| name == key));
        match existing {
            Some(index) => {
                let ending: &[u8] = if lines[index].ends_with(CRLF) {
                    CRLF
                } else if lines[index].ends_with(LF) {
                    LF
                } else {
                    b""
                };
                content.extend_from_slice(ending);
                lines[index] = content;
            }
            None => {
                if let Some(last) = lines.last_mut()
                    && !last.ends_with(LF)
                {
                    last.extend_from_slice(newline);
                }
                content.extend_from_slice(newline);
                lines.push(content);
            }
        }
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("txt.tmp");
    fs::write(&temporary, lines.concat())?;
    fs::rename(&temporary, path)?;
    Ok(())
}

fn sorted_dirs(path: &Path) -> AppResult<Vec<String>> {
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
        .filter(|name| !name.starts_with('.') && name != SAVED_VARIABLES)
        .collect();
    names.sort_by_key(|name| name.to_lowercase());
    Ok(names)
}

/// Accounts, realms and characters found under `WTF\Account`.
///
/// # Errors
///
/// Fails when a folder exists but cannot be read.
pub fn accounts(game_root: &Path) -> AppResult<Vec<AddonAccount>> {
    let root = game_root.join("WTF").join("Account");
    sorted_dirs(&root)?
        .into_iter()
        .map(|account| {
            let account_dir = root.join(&account);
            let realms = sorted_dirs(&account_dir)?
                .into_iter()
                .map(|realm| {
                    let characters = sorted_dirs(&account_dir.join(&realm))?;
                    Ok(AddonRealm {
                        name: realm,
                        characters,
                    })
                })
                .collect::<AppResult<Vec<AddonRealm>>>()?;
            Ok(AddonAccount {
                name: account,
                realms,
            })
        })
        .collect()
}

/// Installed addons, with their state for the target or their `.toc` default.
///
/// # Errors
///
/// Fails when the addons folder or an `AddOns.txt` cannot be read, or the
/// target has an invalid name.
pub fn list(
    game_root: &Path,
    expansion: &str,
    target: Option<&AddonTarget>,
) -> AppResult<Vec<Addon>> {
    let folder = addons_dir(game_root);
    let installed = sorted_dirs(&folder)?;

    let (character_states, account_states) = match target {
        Some(target) => {
            let account = read_states(&account_file(game_root, target)?)?;
            let character = if target.character.is_some() {
                read_states(&addons_file(game_root, target)?)?
            } else {
                HashMap::new()
            };
            (character, account)
        }
        None => (HashMap::new(), HashMap::new()),
    };

    let lower_installed: Vec<String> = installed.iter().map(|name| name.to_lowercase()).collect();
    let game_interface = interface_version(expansion);
    let mut addons = Vec::new();
    for name in &installed {
        let Some(toc) = read_toc(&folder.join(name), name)? else {
            continue;
        };
        let key = name.to_lowercase();
        let enabled = character_states
            .get(&key)
            .or_else(|| account_states.get(&key))
            .copied()
            .unwrap_or(!toc.default_disabled);
        let missing_dependencies = toc
            .dependencies
            .iter()
            .filter(|dependency| {
                let lower = dependency.to_lowercase();
                !lower.starts_with("blizzard_") && !lower_installed.contains(&lower)
            })
            .cloned()
            .collect();
        let outdated =
            matches!((toc.interface, game_interface), (Some(addon), Some(game)) if addon != game);
        addons.push(Addon {
            folder: name.clone(),
            title: if toc.title.is_empty() {
                name.clone()
            } else {
                toc.title
            },
            notes: toc.notes,
            author: toc.author,
            version: toc.version,
            interface: toc.interface,
            dependencies: toc.dependencies,
            optional_dependencies: toc.optional_dependencies,
            missing_dependencies,
            load_on_demand: toc.load_on_demand,
            enabled,
            outdated,
        });
    }
    addons.sort_by_key(|addon| addon.title.to_lowercase());
    Ok(addons)
}

/// Enable or disable addons in the `AddOns.txt` of the target.
///
/// # Errors
///
/// Fails when a name is invalid or the file cannot be written.
pub fn set_enabled(
    game_root: &Path,
    target: &AddonTarget,
    folders: &[String],
    enabled: bool,
) -> AppResult<()> {
    let changes = folders
        .iter()
        .map(|folder| Ok((checked_name(folder)?.to_owned(), enabled)))
        .collect::<AppResult<Vec<(String, bool)>>>()?;
    let path = addons_file(game_root, target)?;
    write_states(&path, &changes)?;
    tracing::info!(count = changes.len(), enabled, "Addon states saved");
    Ok(())
}

/// Delete an addon folder.
///
/// # Errors
///
/// Fails when the name is invalid, the addon does not exist or the folder
/// cannot be removed.
pub fn delete(game_root: &Path, folder: &str) -> AppResult<()> {
    let path = addons_dir(game_root).join(checked_name(folder)?);
    if !path.is_dir() {
        return Err(AppError::NotFound {
            entity: "addon",
            id: folder.to_owned(),
        });
    }
    fs::remove_dir_all(&path)?;
    tracing::info!(addon = folder, "Addon deleted");
    Ok(())
}

/// Install every addon folder found in a zip archive, replacing addons with
/// the same name, and return the installed folder names.
///
/// # Errors
///
/// Fails when the archive cannot be read, is too large, contains unsafe paths
/// or has no addon folder.
pub fn install(game_root: &Path, archive_path: &Path) -> AppResult<Vec<String>> {
    let destination = addons_dir(game_root);
    fs::create_dir_all(&destination)?;
    let staging = destination.join(format!("{STAGING_PREFIX}{}", Uuid::new_v4()));
    let result = install_into(&destination, archive_path, &staging);
    if staging.exists()
        && let Err(error) = fs::remove_dir_all(&staging)
    {
        tracing::warn!(%error, "Could not remove the addon import folder");
    }
    result
}

fn install_into(destination: &Path, archive_path: &Path, staging: &Path) -> AppResult<Vec<String>> {
    let mut archive = zip::ZipArchive::new(File::open(archive_path)?)?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(AppError::AddonArchiveTooLarge);
    }
    let mut total: u64 = 0;
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        if entry.enclosed_name().is_none() {
            return Err(AppError::AddonNameInvalid(
                entry.name_raw().escape_ascii().to_string(),
            ));
        }
        total = total.saturating_add(entry.size());
    }
    if total > MAX_ARCHIVE_BYTES {
        return Err(AppError::AddonArchiveTooLarge);
    }

    fs::create_dir_all(staging)?;
    archive.extract(staging)?;
    let mut roots = Vec::new();
    find_addon_roots(staging, 0, &mut roots)?;
    if roots.is_empty() {
        return Err(AppError::AddonArchiveEmpty);
    }

    let mut installed = Vec::new();
    for root in roots {
        let Some(name) = root
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_owned)
        else {
            continue;
        };
        let target = destination.join(checked_name(&name)?);
        if target.exists() {
            fs::remove_dir_all(&target)?;
        }
        fs::rename(&root, &target)?;
        installed.push(name);
    }
    installed.sort_by_key(|name| name.to_lowercase());
    tracing::info!(addons = ?installed, "Addons installed");
    Ok(installed)
}

/// Folders below `folder` that contain a `.toc` with their own name.
fn find_addon_roots(folder: &Path, depth: usize, roots: &mut Vec<PathBuf>) -> AppResult<()> {
    if depth > MAX_ADDON_DEPTH {
        return Ok(());
    }
    for entry in fs::read_dir(folder)?.filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if path.join(format!("{name}.toc")).is_file() {
            roots.push(path);
        } else {
            find_addon_roots(&path, depth + 1, roots)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use zip::write::SimpleFileOptions;

    use super::*;

    fn temp_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("zforge-addons-{}", Uuid::new_v4()));
        let _ = fs::create_dir_all(&root);
        root
    }

    fn add_addon(root: &Path, name: &str, toc: &str) -> AppResult<()> {
        let folder = addons_dir(root).join(name);
        fs::create_dir_all(&folder)?;
        fs::write(folder.join(format!("{name}.toc")), toc)?;
        Ok(())
    }

    fn target(account: &str, character: Option<(&str, &str)>) -> AddonTarget {
        AddonTarget {
            account: account.to_owned(),
            realm: character.map(|(realm, _)| realm.to_owned()),
            character: character.map(|(_, name)| name.to_owned()),
        }
    }

    #[test]
    fn parses_toc_fields() {
        let toc = parse_toc(
            "## Interface: 30300\r\n## Title: |cff33ccffBag|rnon\r\n## Notes: Bags\r\n\
             ## Dependencies: Core, Lib\r\n## OptionalDeps: Extra\r\n## LoadOnDemand: 1\r\n\
             ## DefaultState: disabled\r\nBagnon.lua\r\n",
        );
        assert_eq!(toc.title, "Bagnon");
        assert_eq!(toc.interface, Some(30300));
        assert_eq!(toc.dependencies, vec!["Core".to_owned(), "Lib".to_owned()]);
        assert_eq!(toc.optional_dependencies, vec!["Extra".to_owned()]);
        assert!(toc.load_on_demand);
        assert!(toc.default_disabled);
    }

    #[test]
    fn lists_states_dependencies_and_versions() -> AppResult<()> {
        let root = temp_root();
        add_addon(&root, "Bagnon", "## Interface: 30300\n## Title: Bagnon\n")?;
        add_addon(
            &root,
            "Plugin",
            "## Interface: 20400\n## Dependencies: Missing, Bagnon\n",
        )?;
        fs::create_dir_all(addons_dir(&root).join("NoToc"))?;
        let account = root.join("WTF").join("Account").join("ACC");
        fs::create_dir_all(account.join("Realm").join("Hero"))?;
        fs::write(account.join(ADDONS_FILE), "Bagnon: disabled\r\n")?;
        fs::write(
            account.join("Realm").join("Hero").join(ADDONS_FILE),
            "Bagnon: enabled\r\n",
        )?;

        let by_account = list(&root, "wotlk", Some(&target("ACC", None)))?;
        assert_eq!(by_account.len(), 2);
        assert!(!by_account[0].enabled);
        assert_eq!(
            by_account[1].missing_dependencies,
            vec!["Missing".to_owned()]
        );
        assert!(by_account[1].outdated);
        assert!(!by_account[0].outdated);

        let by_character = list(
            &root,
            "wotlk",
            Some(&target("ACC", Some(("Realm", "Hero")))),
        )?;
        assert!(by_character[0].enabled);

        let found = accounts(&root)?;
        assert_eq!(found[0].name, "ACC");
        assert_eq!(found[0].realms[0].characters, vec!["Hero".to_owned()]);
        let _ = fs::remove_dir_all(&root);
        Ok(())
    }

    #[test]
    fn writes_states_keeping_other_lines() -> AppResult<()> {
        let root = temp_root();
        let account = root.join("WTF").join("Account").join("ACC");
        fs::create_dir_all(&account)?;
        fs::write(
            account.join(ADDONS_FILE),
            "Other: enabled\r\nBAGNON: enabled\r\n",
        )?;
        set_enabled(
            &root,
            &target("ACC", None),
            &["Bagnon".to_owned(), "New".to_owned()],
            false,
        )?;
        let text = fs::read_to_string(account.join(ADDONS_FILE))?;
        assert_eq!(
            text,
            "Other: enabled\r\nBagnon: disabled\r\nNew: disabled\r\n"
        );
        assert!(set_enabled(&root, &target("../x", None), &[], true).is_err());
        let _ = fs::remove_dir_all(&root);
        Ok(())
    }

    #[test]
    fn installs_nested_addons_and_deletes_them() -> AppResult<()> {
        let root = temp_root();
        let archive_path = root.join("pack.zip");
        let mut writer = zip::ZipWriter::new(File::create(&archive_path)?);
        let options = SimpleFileOptions::default();
        writer.start_file("Pack-1.0/Bagnon/Bagnon.toc", options)?;
        writer.write_all(b"## Title: Bagnon\n")?;
        writer.start_file("Pack-1.0/Bagnon_Config/Bagnon_Config.toc", options)?;
        writer.write_all(b"## Title: Config\n")?;
        writer.start_file("Pack-1.0/readme.txt", options)?;
        writer.write_all(b"read me")?;
        writer.finish()?;

        let installed = install(&root, &archive_path)?;
        assert_eq!(
            installed,
            vec!["Bagnon".to_owned(), "Bagnon_Config".to_owned()]
        );
        assert!(
            addons_dir(&root)
                .join("Bagnon")
                .join("Bagnon.toc")
                .is_file()
        );
        assert_eq!(sorted_dirs(&addons_dir(&root))?.len(), 2);

        delete(&root, "Bagnon")?;
        assert!(!addons_dir(&root).join("Bagnon").exists());
        assert!(delete(&root, "..").is_err());
        let _ = fs::remove_dir_all(&root);
        Ok(())
    }

    #[test]
    fn rejects_archives_without_addons() -> AppResult<()> {
        let root = temp_root();
        let archive_path = root.join("empty.zip");
        let mut writer = zip::ZipWriter::new(File::create(&archive_path)?);
        writer.start_file("readme.txt", SimpleFileOptions::default())?;
        writer.write_all(b"nothing")?;
        writer.finish()?;
        assert!(matches!(
            install(&root, &archive_path),
            Err(AppError::AddonArchiveEmpty)
        ));
        let _ = fs::remove_dir_all(&root);
        Ok(())
    }
}
