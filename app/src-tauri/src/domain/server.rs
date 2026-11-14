//! Server and realm list catalogue entries.

use serde::{Deserialize, Serialize};

/// One selectable server (bundled or user-saved) in the realm list picker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ServerEntry {
    /// Display name.
    pub name: String,
    /// Public URL of the server logo, if any.
    pub logo: Option<String>,
    /// Realm list hosts that belong to this server.
    pub realmlists: Vec<String>,
    /// Known realm names.
    pub realms: Vec<String>,
    /// Server website.
    #[serde(default)]
    pub website: String,
    /// Whether the user saved this entry (as opposed to the bundled catalogue).
    #[serde(default)]
    pub custom: bool,
}

/// A realm list saved by the user.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CustomServer {
    /// Realm list host, unique per entry.
    pub realmlist: String,
    /// Display name.
    pub name: String,
    /// Realm names saved for this realm list, in insertion order.
    pub realms: Vec<String>,
}

impl From<CustomServer> for ServerEntry {
    fn from(server: CustomServer) -> Self {
        Self {
            name: server.name,
            logo: None,
            realmlists: vec![server.realmlist],
            realms: server.realms,
            website: String::new(),
            custom: true,
        }
    }
}
