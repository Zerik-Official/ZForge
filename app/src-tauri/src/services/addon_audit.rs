//! Static check of the installed addons: `.toc` problems and Lua code that can act on
//! the player's items, gold or guild without them noticing.
//!
//! The check looks for known API calls and patterns in the `.lua` and `.xml` files,
//! ignoring comments. It cannot prove that an addon is safe or harmful: it points at
//! code worth a look, and the interface explains the legitimate uses of each rule.
//! Results are cached by a fingerprint of each addon's files, so only addons that
//! changed are read again.

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::domain::addon_audit::{AddonFinding, AddonReport, GameAudit, Severity};
use crate::error::{AppError, AppResult};
use crate::services::addons;

/// Version of the rules; a change makes every cached report stale.
const RULES_VERSION: u32 = 2;

/// Files larger than this are not read (generated data, not code worth checking).
const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;

/// Deepest folder level read inside an addon.
const MAX_DEPTH: usize = 8;

/// Longest excerpt kept for a finding.
const EXCERPT_CHARS: usize = 160;

/// A string literal this long without spaces is likely packed or obfuscated code.
const LONG_LITERAL_CHARS: usize = 2_000;

/// This many `\ddd` escapes in one line is likely obfuscated code.
const ESCAPES_PER_LINE: usize = 40;

/// API functions and what they reveal about an addon.
///
/// Only calls count: the name followed by `(`, a string or a table, so a function kept
/// in a local variable or listed in a table (such as the functions WeakAuras blocks)
/// does not.
const CALL_RULES: &[(&str, Severity, &[&str])] = &[
    ("delete_items", Severity::Danger, &["DeleteCursorItem"]),
    ("send_gold", Severity::Danger, &["SetSendMailMoney"]),
    (
        "give_gold",
        Severity::Danger,
        &["PickupPlayerMoney", "AddTradeMoney", "SetTradeMoney"],
    ),
    (
        "guild_bank_withdraw",
        Severity::Danger,
        &["WithdrawGuildBankMoney"],
    ),
    ("auto_confirm", Severity::Danger, &["StaticPopup_OnClick"]),
    (
        "guild_control",
        Severity::Warning,
        &[
            "GuildUninvite",
            "GuildDisband",
            "GuildSetLeader",
            "GuildDemote",
        ],
    ),
    ("accept_trade", Severity::Warning, &["AcceptTrade"]),
    ("send_mail", Severity::Info, &["SendMail"]),
    ("dynamic_code", Severity::Info, &["loadstring", "RunScript"]),
    ("logout", Severity::Info, &["Logout", "Quit", "ForceQuit"]),
    (
        "auction",
        Severity::Info,
        &["StartAuction", "PlaceAuctionBid"],
    ),
    ("environment", Severity::Info, &["setfenv"]),
];

/// Text patterns that click the accept button of a dialog or answer the dialog to
/// delete an item for the player.
const CONFIRM_PATTERNS: &[&str] = &[
    "StaticPopup1Button1:Click",
    "StaticPopup2Button1:Click",
    "\"DELETE_ITEM\"",
    "\"DELETE_GOOD_ITEM\"",
];

/// Shortest line that can hold enough escapes or a long enough literal to look packed.
const MIN_PACKED_LINE: usize = 4 * ESCAPES_PER_LINE;

/// Events that bring text from other players into an addon.
const REMOTE_EVENTS: &[&str] = &["CHAT_MSG_ADDON", "CHAT_MSG_WHISPER", "CHAT_MSG_CHANNEL"];

/// A finding while a file is being read, before its occurrences are counted.
struct Hit {
    rule: &'static str,
    severity: Severity,
    line: u32,
    excerpt: String,
}

/// Replace Lua comments with spaces, keeping line breaks so line numbers stay right.
fn strip_comments(source: &str) -> String {
    let mut output = String::with_capacity(source.len());
    let mut index = 0;
    let mut quote: Option<char> = None;
    while index < source.len() {
        let next = next_char_boundary(source, index);
        let current = &source[index..next];
        if let Some(open) = quote {
            if current == "\\" && next < source.len() {
                let after = next_char_boundary(source, next);
                output.push_str(&source[index..after]);
                index = after;
                continue;
            }
            if current.starts_with(open) || current == "\n" {
                quote = None;
            }
            output.push_str(current);
            index = next;
            continue;
        }
        if current == "\"" || current == "'" {
            quote = current.chars().next();
            output.push_str(current);
            index = next;
            continue;
        }
        if source[index..].starts_with("--") {
            let rest = &source[index + 2..];
            let end = match long_bracket_level(rest) {
                Some(level) => {
                    let close = format!("]{}]", "=".repeat(level));
                    rest.find(&close)
                        .map_or(source.len(), |at| index + 2 + at + close.len())
                }
                None => rest.find('\n').map_or(source.len(), |at| index + 2 + at),
            };
            for skipped in source[index..end].chars() {
                output.push(if skipped == '\n' { '\n' } else { ' ' });
            }
            index = end;
            continue;
        }
        output.push_str(current);
        index = next;
    }
    output
}

/// Level of a long bracket such as `[[` or `[==[` at the start of `text`.
fn long_bracket_level(text: &str) -> Option<usize> {
    let rest = text.strip_prefix('[')?;
    let level = rest
        .chars()
        .take_while(|&character| character == '=')
        .count();
    rest[level..].starts_with('[').then_some(level)
}

fn next_char_boundary(text: &str, index: usize) -> usize {
    let mut next = index + 1;
    while next < text.len() && !text.is_char_boundary(next) {
        next += 1;
    }
    next
}

fn is_identifier_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

/// Whether `line` calls the global function `name`: the whole identifier, not a field or
/// method of another value (`obj.Quit` or `obj:Quit` do not count), followed by `(`, a
/// string or a table.
fn calls_global(line: &str, name: &str) -> bool {
    let mut start = 0;
    while let Some(found) = line[start..].find(name) {
        let at = start + found;
        let before = line[..at].chars().next_back();
        let rest = &line[at + name.len()..];
        let clean_before = before.is_none_or(|character| {
            !is_identifier_char(character) && character != '.' && character != ':'
        });
        let clean_after = rest
            .chars()
            .next()
            .is_none_or(|character| !is_identifier_char(character));
        let called = rest.trim_start().starts_with(['(', '"', '\'', '{', '[']);
        if clean_before && clean_after && called {
            return true;
        }
        start = at + name.len();
    }
    false
}

fn excerpt(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.chars().count() <= EXCERPT_CHARS {
        return trimmed.to_owned();
    }
    let mut cut: String = trimmed.chars().take(EXCERPT_CHARS).collect();
    cut.push('…');
    cut
}

/// Whether a line looks like packed or obfuscated code.
fn looks_obfuscated(line: &str) -> bool {
    if line.len() < MIN_PACKED_LINE {
        return false;
    }
    let escapes = line
        .as_bytes()
        .windows(2)
        .filter(|pair| pair[0] == b'\\' && pair[1].is_ascii_digit())
        .count();
    if escapes >= ESCAPES_PER_LINE {
        return true;
    }
    line.split(['"', '\''])
        .skip(1)
        .step_by(2)
        .any(|literal| literal.len() >= LONG_LITERAL_CHARS && !literal.contains(' '))
}

/// Find the risky code of one source file.
fn scan_source(source: &str) -> Vec<Hit> {
    let code = strip_comments(source);
    let listens_to_players = REMOTE_EVENTS.iter().any(|event| code.contains(event));
    let rules: Vec<_> = CALL_RULES
        .iter()
        .filter(|(_, _, names)| names.iter().any(|name| code.contains(name)))
        .collect();
    let may_confirm = CONFIRM_PATTERNS
        .iter()
        .any(|pattern| code.contains(pattern));
    let mut hits = Vec::new();
    for (index, line) in code.lines().enumerate() {
        let number = u32::try_from(index + 1).unwrap_or(u32::MAX);
        for (rule, severity, names) in &rules {
            if names.iter().any(|name| calls_global(line, name)) {
                let (rule, severity) = if *rule == "dynamic_code" && listens_to_players {
                    ("remote_code", Severity::Warning)
                } else {
                    (*rule, *severity)
                };
                hits.push(Hit {
                    rule,
                    severity,
                    line: number,
                    excerpt: excerpt(line),
                });
            }
        }
        if may_confirm
            && CONFIRM_PATTERNS
                .iter()
                .any(|pattern| line.contains(pattern))
        {
            hits.push(Hit {
                rule: "auto_confirm",
                severity: Severity::Danger,
                line: number,
                excerpt: excerpt(line),
            });
        }
        if looks_obfuscated(line) {
            hits.push(Hit {
                rule: "obfuscated",
                severity: Severity::Warning,
                line: number,
                excerpt: excerpt(line),
            });
        }
    }
    hits
}

/// Group the hits of a file by rule: first line, excerpt and number of occurrences.
fn group_hits(file: &str, hits: Vec<Hit>) -> Vec<AddonFinding> {
    let mut grouped: BTreeMap<&'static str, AddonFinding> = BTreeMap::new();
    for hit in hits {
        grouped
            .entry(hit.rule)
            .and_modify(|finding| finding.count += 1)
            .or_insert_with(|| AddonFinding {
                rule: hit.rule.to_owned(),
                severity: hit.severity,
                file: file.to_owned(),
                line: hit.line,
                count: 1,
                excerpt: hit.excerpt,
            });
    }
    grouped.into_values().collect()
}

/// Every `.lua` and `.xml` file of an addon, with its path relative to the addon folder.
fn source_files(folder: &Path) -> Vec<(String, PathBuf, fs::Metadata)> {
    let mut files = Vec::new();
    let mut pending = vec![(folder.to_path_buf(), 0)];
    while let Some((directory, depth)) = pending.pop() {
        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if metadata.is_dir() {
                if depth < MAX_DEPTH {
                    pending.push((path, depth + 1));
                }
                continue;
            }
            let extension = path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(str::to_ascii_lowercase);
            if !matches!(extension.as_deref(), Some("lua" | "xml" | "toc")) {
                continue;
            }
            let relative = path
                .strip_prefix(folder)
                .map(|relative| relative.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            files.push((relative, path, metadata));
        }
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    files
}

/// Fingerprint of an addon's files: their paths, sizes and modification times.
fn fingerprint(files: &[(String, PathBuf, fs::Metadata)]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(RULES_VERSION.to_le_bytes());
    for (relative, _, metadata) in files {
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |elapsed| elapsed.as_secs());
        hasher.update(relative.as_bytes());
        hasher.update(metadata.len().to_le_bytes());
        hasher.update(modified.to_le_bytes());
    }
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Files listed in a `.toc` that do not exist in the addon folder.
fn missing_toc_files(folder: &Path, toc: &str) -> Vec<(u32, String)> {
    toc.lines()
        .enumerate()
        .filter_map(|(index, line)| {
            let entry = line.trim();
            if entry.is_empty() || entry.starts_with('#') || entry.starts_with("--") {
                return None;
            }
            let relative = entry.replace('\\', "/");
            let exists = folder.join(&relative).exists();
            (!exists).then(|| {
                (
                    u32::try_from(index + 1).unwrap_or(u32::MAX),
                    entry.to_owned(),
                )
            })
        })
        .collect()
}

/// Findings of an addon's own files: its `.toc` and its code.
fn audit_files(
    folder: &Path,
    name: &str,
    files: &[(String, PathBuf, fs::Metadata)],
) -> Vec<AddonFinding> {
    let mut findings = Vec::new();
    let toc_name = format!("{name}.toc").to_lowercase();
    let toc = files
        .iter()
        .find(|(relative, _, _)| relative.to_lowercase() == toc_name)
        .and_then(|(_, path, _)| fs::read(path).ok())
        .map(|bytes| {
            String::from_utf8_lossy(&bytes)
                .trim_start_matches('\u{feff}')
                .to_owned()
        });

    match &toc {
        None => findings.push(AddonFinding {
            rule: "toc_missing".to_owned(),
            severity: Severity::Warning,
            file: String::new(),
            line: 0,
            count: 1,
            excerpt: format!("{name}.toc"),
        }),
        Some(text) => {
            let missing = missing_toc_files(folder, text);
            if let Some((line, entry)) = missing.first() {
                findings.push(AddonFinding {
                    rule: "toc_missing_file".to_owned(),
                    severity: Severity::Warning,
                    file: format!("{name}.toc"),
                    line: *line,
                    count: u32::try_from(missing.len()).unwrap_or(u32::MAX),
                    excerpt: entry.clone(),
                });
            }
            let has_interface = text.lines().any(|line| {
                line.trim()
                    .strip_prefix("##")
                    .and_then(|rest| rest.split_once(':'))
                    .is_some_and(|(key, _)| key.trim().eq_ignore_ascii_case("interface"))
            });
            if !has_interface {
                findings.push(AddonFinding {
                    rule: "toc_no_interface".to_owned(),
                    severity: Severity::Info,
                    file: format!("{name}.toc"),
                    line: 0,
                    count: 1,
                    excerpt: String::new(),
                });
            }
        }
    }

    for (relative, path, metadata) in files {
        if relative.to_lowercase().ends_with(".toc") || metadata.len() > MAX_FILE_BYTES {
            continue;
        }
        let Ok(bytes) = fs::read(path) else {
            continue;
        };
        let source = String::from_utf8_lossy(&bytes);
        findings.extend(group_hits(relative, scan_source(&source)));
    }
    findings
}

/// A cached report and the fingerprint of the files it was made from.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct CachedReport {
    fingerprint: String,
    findings: Vec<AddonFinding>,
}

/// Cached reports by game and addon folder.
type AuditCache = HashMap<String, HashMap<String, CachedReport>>;

/// Checks the addons of each game and keeps the latest results.
#[derive(Debug)]
pub struct AddonAuditor {
    cache_file: PathBuf,
    cache: Mutex<Option<AuditCache>>,
    results: Mutex<HashMap<String, GameAudit>>,
}

impl AddonAuditor {
    /// Auditor whose cache lives in `cache_file`.
    pub fn new(cache_file: PathBuf) -> Self {
        Self {
            cache_file,
            cache: Mutex::new(None),
            results: Mutex::new(HashMap::new()),
        }
    }

    /// Check every installed addon of a game, reading again only the addons whose files
    /// changed since the last check.
    ///
    /// # Errors
    ///
    /// Returns an error when the addons folder or the `.toc` files cannot be read, or a
    /// lock is poisoned.
    pub fn audit(&self, game_id: &str, game_root: &Path, expansion: &str) -> AppResult<GameAudit> {
        let folder = addons::addons_dir(game_root);
        let installed = addon_folders(&folder)?;
        let listed: HashMap<String, (Vec<String>, bool)> =
            addons::list(game_root, expansion, None)?
                .into_iter()
                .map(|addon| (addon.folder, (addon.missing_dependencies, addon.outdated)))
                .collect();

        let mut cache = self
            .cache
            .lock()
            .map_err(|_| AppError::LockPoisoned("addon audit cache"))?;
        let cache = cache.get_or_insert_with(|| load_cache(&self.cache_file));
        let previous = cache.remove(game_id).unwrap_or_default();
        let mut current = HashMap::new();

        let mut audit = GameAudit::default();
        for name in &installed {
            let addon_folder = folder.join(name);
            let files = source_files(&addon_folder);
            let print = fingerprint(&files);
            let findings = match previous.get(name) {
                Some(cached) if cached.fingerprint == print => cached.findings.clone(),
                _ => audit_files(&addon_folder, name, &files),
            };
            current.insert(
                name.clone(),
                CachedReport {
                    fingerprint: print,
                    findings: findings.clone(),
                },
            );

            let mut findings = findings;
            if let Some((missing, outdated)) = listed.get(name) {
                if let Some(first) = missing.first() {
                    findings.push(AddonFinding {
                        rule: "missing_dependency".to_owned(),
                        severity: Severity::Warning,
                        file: format!("{name}.toc"),
                        line: 0,
                        count: u32::try_from(missing.len()).unwrap_or(u32::MAX),
                        excerpt: if missing.len() == 1 {
                            first.clone()
                        } else {
                            missing.join(", ")
                        },
                    });
                }
                if *outdated {
                    findings.push(AddonFinding {
                        rule: "outdated".to_owned(),
                        severity: Severity::Info,
                        file: format!("{name}.toc"),
                        line: 0,
                        count: 1,
                        excerpt: String::new(),
                    });
                }
            }
            if !findings.is_empty() {
                audit
                    .addons
                    .insert(name.clone(), AddonReport::from_findings(findings));
            }
            audit.checked += 1;
        }

        cache.insert(game_id.to_owned(), current);
        if let Err(error) = save_cache(&self.cache_file, cache) {
            tracing::warn!(%error, "Could not save the addon check cache");
        }
        self.results
            .lock()
            .map_err(|_| AppError::LockPoisoned("addon audit results"))?
            .insert(game_id.to_owned(), audit.clone());
        Ok(audit)
    }

    /// The latest results of a game, if it was checked during this run.
    ///
    /// # Errors
    ///
    /// Returns an error when the lock is poisoned.
    pub fn latest(&self, game_id: &str) -> AppResult<Option<GameAudit>> {
        Ok(self
            .results
            .lock()
            .map_err(|_| AppError::LockPoisoned("addon audit results"))?
            .get(game_id)
            .cloned())
    }
}

/// Addon folders, without the game's own `Blizzard_` addons.
fn addon_folders(folder: &Path) -> AppResult<Vec<String>> {
    let entries = match fs::read_dir(folder) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
        .filter(|name| {
            !name.starts_with('.') && !name.to_ascii_lowercase().starts_with("blizzard_")
        })
        .collect();
    names.sort_by_key(|name| name.to_lowercase());
    Ok(names)
}

fn load_cache(path: &Path) -> AuditCache {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => AuditCache::new(),
    }
}

fn save_cache(path: &Path, cache: &AuditCache) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec(cache)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules(source: &str) -> Vec<&'static str> {
        scan_source(source)
            .into_iter()
            .map(|hit| hit.rule)
            .collect()
    }

    #[test]
    fn finds_item_deletion_and_gold_mail() {
        let source = "PickupContainerItem(0, 1)\nDeleteCursorItem()\nSetSendMailMoney(10000)\n";
        assert_eq!(rules(source), vec!["delete_items", "send_gold"]);
    }

    #[test]
    fn ignores_comments_and_methods() {
        let source = "-- DeleteCursorItem()\n--[[ SetSendMailMoney(1) ]]\nframe:Quit()\nlocal t = obj.Logout\n";
        assert!(rules(source).is_empty());
    }

    #[test]
    fn keeps_code_inside_strings_that_look_like_comments() {
        let source = "print(\"--not a comment\") DeleteCursorItem()\n";
        assert_eq!(rules(source), vec!["delete_items"]);
    }

    #[test]
    fn dynamic_code_fed_by_other_players_is_dangerous() {
        let source = "f:RegisterEvent(\"CHAT_MSG_ADDON\")\nlocal run = loadstring(msg)\n";
        let hits = scan_source(source);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].rule, "remote_code");
        assert_eq!(hits[0].severity, Severity::Warning);
        assert_eq!(rules("local f = loadstring(code)\n"), vec!["dynamic_code"]);
    }

    #[test]
    fn finds_dialogs_confirmed_for_the_player() {
        assert_eq!(rules("StaticPopup1Button1:Click()\n"), vec!["auto_confirm"]);
        assert_eq!(
            rules("StaticPopup_OnClick(dialog, 1)\n"),
            vec!["auto_confirm"]
        );
        assert!(rules("E:StaticPopup_OnClick(self, i)\n").is_empty());
    }

    #[test]
    fn ignores_functions_that_are_only_kept_or_listed() {
        let source = "local DeleteCursorItem = DeleteCursorItem\nlocal blocked = { SetSendMailMoney = true }\n";
        assert!(rules(source).is_empty());
    }

    #[test]
    fn keeps_line_numbers_and_text_with_accents() {
        let source = "local s = \"canción -- no\"\n--[[ bloque\nlargo ]]\nDeleteCursorItem()\n";
        let hits = scan_source(source);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].line, 4);
        assert!(strip_comments(source).contains("canción -- no"));
    }

    #[test]
    fn counts_repeated_hits_once_per_rule() {
        let findings = group_hits(
            "Core.lua",
            scan_source("DeleteCursorItem()\nDeleteCursorItem()\n"),
        );
        assert_eq!(findings.len(), 1);
        assert_eq!((findings[0].line, findings[0].count), (1, 2));
    }

    #[test]
    fn flags_packed_code() {
        let escaped = "\\104".repeat(ESCAPES_PER_LINE);
        assert_eq!(
            rules(&format!("local s = \"{escaped}\"\n")),
            vec!["obfuscated"]
        );
    }

    #[test]
    fn reports_toc_problems_and_reuses_the_cache() -> AppResult<()> {
        let root = tempfile::tempdir()?;
        let folder = root.path().join("Interface").join("AddOns").join("Bad");
        fs::create_dir_all(&folder)?;
        fs::write(
            folder.join("Bad.toc"),
            "## Title: Bad\nCore.lua\nMissing.lua\n",
        )?;
        fs::write(folder.join("Core.lua"), "DeleteCursorItem()\n")?;

        let auditor = AddonAuditor::new(root.path().join("cache.json"));
        let audit = auditor.audit("game", root.path(), "wotlk")?;
        let report = audit.addons.get("Bad").cloned().unwrap_or_default();
        assert_eq!(report.severity, Some(Severity::Danger));
        let found: Vec<&str> = report
            .findings
            .iter()
            .map(|finding| finding.rule.as_str())
            .collect();
        assert!(found.contains(&"delete_items"));
        assert!(found.contains(&"toc_missing_file"));
        assert!(found.contains(&"toc_no_interface"));

        let again = AddonAuditor::new(root.path().join("cache.json")).audit(
            "game",
            root.path(),
            "wotlk",
        )?;
        assert_eq!(again, audit);
        Ok(())
    }
}
