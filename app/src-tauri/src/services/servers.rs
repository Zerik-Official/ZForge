//! Realm list catalogue: bundled servers plus user-saved realm lists.

use serde::Deserialize;

use crate::domain::server::ServerEntry;
use crate::error::AppResult;
use crate::services::resources::CDN_BASE_URL;
use crate::storage::Database;

const BUNDLED_SERVERS_JSON: &str = include_str!("../../resources/servers.json");
const SERVER_LOGO_URL_PREFIX: &str = "/assets/servers/logos";

#[derive(Debug, Deserialize)]
struct BundledServer {
    name: String,
    #[serde(default)]
    logo: Option<String>,
    #[serde(default)]
    realmlists: Vec<String>,
    #[serde(default)]
    realms: Vec<String>,
    #[serde(default)]
    website: String,
}

impl From<BundledServer> for ServerEntry {
    fn from(server: BundledServer) -> Self {
        Self {
            name: server.name,
            logo: server
                .logo
                .filter(|logo| !logo.is_empty())
                .map(|logo| format!("{SERVER_LOGO_URL_PREFIX}/{logo}")),
            realmlists: server.realmlists,
            realms: server.realms,
            website: server.website,
            custom: false,
        }
    }
}

/// Public logo of a server, for images shown outside the launcher such as Discord.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerBadge {
    /// Address of the logo on the assets CDN.
    pub image: String,
    /// Server or core name.
    pub name: String,
}

/// Whether a realmlist points to this computer.
pub fn is_local(realmlist: &str) -> bool {
    let address = realmlist.trim().to_ascii_lowercase();
    if address == "::1" || address.starts_with("[::1]") {
        return true;
    }
    let host = address.split(':').next().unwrap_or_default();
    host == "localhost" || host.starts_with("127.")
}

/// Logo of the server a realmlist belongs to: a bundled server, or the core of a local
/// server guessed from its realm name (the default names of TrinityCore and AzerothCore).
pub fn badge(realmlist: &str, realm: &str) -> Option<ServerBadge> {
    let realmlist = realmlist.trim();
    if realmlist.is_empty() {
        return None;
    }
    if is_local(realmlist) {
        let realm = realm.to_ascii_lowercase();
        let (file, name) = if realm.contains("azeroth") {
            ("azeroth-core.png", "AzerothCore")
        } else if realm.contains("trinity") {
            ("trinity-core.png", "TrinityCore")
        } else {
            return None;
        };
        return Some(ServerBadge {
            image: format!("{CDN_BASE_URL}/wow-server-logos/cores/{file}"),
            name: name.to_owned(),
        });
    }
    let servers: Vec<BundledServer> = serde_json::from_str(BUNDLED_SERVERS_JSON).ok()?;
    servers.into_iter().find_map(|server| {
        let matches = server
            .realmlists
            .iter()
            .any(|entry| entry.eq_ignore_ascii_case(realmlist));
        let logo = server.logo.filter(|logo| !logo.is_empty())?;
        matches.then(|| ServerBadge {
            image: format!("{CDN_BASE_URL}/wow-server-logos/servers/{logo}"),
            name: server.name,
        })
    })
}

/// Parse the bundled server catalogue shipped with the launcher.
///
/// # Errors
///
/// Fails when the bundled JSON is invalid.
pub fn bundled() -> AppResult<Vec<ServerEntry>> {
    let servers: Vec<BundledServer> = serde_json::from_str(BUNDLED_SERVERS_JSON)?;
    Ok(servers.into_iter().map(ServerEntry::from).collect())
}

/// Bundled servers followed by the user's saved realm lists.
///
/// # Errors
///
/// Fails when the bundled catalogue is invalid or the database query fails.
pub fn list(database: &Database) -> AppResult<Vec<ServerEntry>> {
    let mut entries = bundled()?;
    entries.extend(
        database
            .list_custom_servers()?
            .into_iter()
            .map(ServerEntry::from),
    );
    Ok(entries)
}

/// Save a new realm list, optionally with its first realm.
///
/// Blank names fall back to the realm list itself; blank realms are ignored.
///
/// # Errors
///
/// Fails when the database write fails.
pub fn save_custom(
    database: &Database,
    realmlist: &str,
    name: Option<&str>,
    realm: Option<&str>,
) -> AppResult<()> {
    let realmlist = realmlist.trim();
    if realmlist.is_empty() {
        return Ok(());
    }
    let name = name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(realmlist);
    let realms: Vec<String> = realm
        .map(str::trim)
        .filter(|realm| !realm.is_empty())
        .map(str::to_owned)
        .into_iter()
        .collect();
    database.add_custom_server(realmlist, name, &realms)?;
    tracing::info!(realmlist, "Custom realm list saved");
    Ok(())
}

/// Append a realm to a saved realm list; blank values are ignored.
///
/// # Errors
///
/// Fails when the database write fails.
pub fn add_custom_realm(database: &Database, realmlist: &str, realm: &str) -> AppResult<()> {
    let (realmlist, realm) = (realmlist.trim(), realm.trim());
    if realmlist.is_empty() || realm.is_empty() {
        return Ok(());
    }
    database.add_custom_realm(realmlist, realm)?;
    tracing::info!(realmlist, realm, "Custom realm added");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_server_and_core_badges() {
        let warmane = badge("logon.warmane.com", "Lordaeron");
        assert_eq!(
            warmane.map(|badge| badge.image),
            Some(format!(
                "{CDN_BASE_URL}/wow-server-logos/servers/warmane.png"
            ))
        );
        let core = badge("127.0.0.1", "AzerothCore");
        assert_eq!(core.map(|badge| badge.name), Some("AzerothCore".to_owned()));
        assert_eq!(badge("localhost:3724", "Mi reino"), None);
        assert_eq!(badge("logon.unknown.org", "Realm"), None);
        assert!(is_local("[::1]:3724"));
        assert!(!is_local("logon.example.com"));
    }

    #[test]
    fn bundled_catalogue_parses_with_logo_urls() -> AppResult<()> {
        let servers = bundled()?;
        assert!(!servers.is_empty());
        assert!(
            servers
                .iter()
                .filter_map(|server| server.logo.as_deref())
                .all(|logo| logo.starts_with("/assets/servers/logos/"))
        );
        Ok(())
    }

    #[test]
    fn custom_servers_follow_bundled_ones() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        let bundled_count = bundled()?.len();
        save_custom(&database, "  logon.example  ", Some(" "), Some("Alpha"))?;
        add_custom_realm(&database, "logon.example", "Beta")?;
        save_custom(&database, "   ", None, None)?;

        let servers = list(&database)?;
        assert_eq!(servers.len(), bundled_count + 1);
        let custom = &servers[bundled_count];
        assert_eq!(custom.name, "logon.example");
        assert_eq!(custom.realms, ["Alpha", "Beta"]);
        assert!(custom.custom);
        Ok(())
    }
}
