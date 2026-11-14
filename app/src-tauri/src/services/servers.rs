//! Realm list catalogue: bundled servers plus user-saved realm lists.

use serde::Deserialize;

use crate::domain::server::ServerEntry;
use crate::error::AppResult;
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
