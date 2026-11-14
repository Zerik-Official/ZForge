//! User-saved realm list repository.

use rusqlite::{Connection, OptionalExtension, params};

use crate::domain::now_millis;
use crate::domain::server::CustomServer;
use crate::error::AppResult;
use crate::storage::Database;

fn realms_of(connection: &Connection, realmlist: &str) -> AppResult<Vec<String>> {
    let mut statement = connection
        .prepare("SELECT name FROM custom_realms WHERE realmlist = ?1 ORDER BY position ASC")?;
    let realms = statement
        .query_map([realmlist], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(realms)
}

fn append_realm(connection: &Connection, realmlist: &str, realm: &str) -> AppResult<()> {
    connection.execute(
        "INSERT OR IGNORE INTO custom_realms (realmlist, name, position) \
         SELECT ?1, ?2, COALESCE(MAX(position), -1) + 1 FROM custom_realms WHERE realmlist = ?1",
        params![realmlist, realm],
    )?;
    Ok(())
}

impl Database {
    /// Every saved realm list in creation order.
    ///
    /// # Errors
    ///
    /// Fails when the query fails.
    pub fn list_custom_servers(&self) -> AppResult<Vec<CustomServer>> {
        self.with_connection(|connection| {
            let mut statement = connection.prepare(
                "SELECT realmlist, name FROM custom_servers ORDER BY created_at ASC, rowid ASC",
            )?;
            let rows = statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<rusqlite::Result<Vec<(String, String)>>>()?;
            rows.into_iter()
                .map(|(realmlist, name)| {
                    let realms = realms_of(connection, &realmlist)?;
                    Ok(CustomServer {
                        realmlist,
                        name,
                        realms,
                    })
                })
                .collect()
        })
    }

    /// A saved realm list, or `None` when it was never saved.
    ///
    /// # Errors
    ///
    /// Fails when the query fails.
    pub fn get_custom_server(&self, realmlist: &str) -> AppResult<Option<CustomServer>> {
        self.with_connection(|connection| {
            let name: Option<String> = connection
                .query_row(
                    "SELECT name FROM custom_servers WHERE realmlist = ?1",
                    [realmlist],
                    |row| row.get(0),
                )
                .optional()?;
            name.map(|name| {
                Ok(CustomServer {
                    realmlist: realmlist.to_owned(),
                    name,
                    realms: realms_of(connection, realmlist)?,
                })
            })
            .transpose()
        })
    }

    /// Save a realm list; a no-op when it already exists.
    ///
    /// # Errors
    ///
    /// Fails when the transaction fails.
    pub fn add_custom_server(
        &self,
        realmlist: &str,
        name: &str,
        realms: &[String],
    ) -> AppResult<()> {
        self.with_connection(|connection| {
            let transaction = connection.transaction()?;
            let inserted = transaction.execute(
                "INSERT OR IGNORE INTO custom_servers (realmlist, name, created_at) \
                 VALUES (?1, ?2, ?3)",
                params![realmlist, name, now_millis()],
            )?;
            if inserted > 0 {
                for realm in realms {
                    append_realm(&transaction, realmlist, realm)?;
                }
            }
            transaction.commit()?;
            Ok(())
        })
    }

    /// Append a realm to a saved realm list.
    ///
    /// A no-op when the realm list is not saved or already contains the realm.
    ///
    /// # Errors
    ///
    /// Fails when the write fails.
    pub fn add_custom_realm(&self, realmlist: &str, realm: &str) -> AppResult<()> {
        self.with_connection(|connection| {
            let exists: bool = connection.query_row(
                "SELECT EXISTS(SELECT 1 FROM custom_servers WHERE realmlist = ?1)",
                [realmlist],
                |row| row.get(0),
            )?;
            if exists {
                append_realm(connection, realmlist, realm)?;
            }
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_servers_and_appends_unique_realms() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        database.add_custom_server("logon.example", "Example", &["Alpha".to_owned()])?;
        database.add_custom_server("logon.example", "Ignored", &[])?;
        database.add_custom_realm("logon.example", "Beta")?;
        database.add_custom_realm("logon.example", "Alpha")?;
        database.add_custom_realm("unknown.example", "Gamma")?;

        let expected = CustomServer {
            realmlist: "logon.example".to_owned(),
            name: "Example".to_owned(),
            realms: vec!["Alpha".to_owned(), "Beta".to_owned()],
        };
        assert_eq!(
            database.get_custom_server("logon.example")?,
            Some(expected.clone())
        );
        assert_eq!(database.list_custom_servers()?, vec![expected]);
        assert_eq!(database.get_custom_server("unknown.example")?, None);
        Ok(())
    }
}
