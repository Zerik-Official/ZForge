//! Schema migrations tracked through `PRAGMA user_version`.
//!
//! Each entry upgrades the schema by one version. Never edit a released
//! migration; append a new one instead.

use rusqlite::Connection;

use crate::error::AppResult;

const MIGRATIONS: &[&str] = &[
    // v1: initial schema.
    "
    CREATE TABLE games (
        id           TEXT    PRIMARY KEY,
        name         TEXT    NOT NULL,
        expansion    TEXT    NOT NULL,
        exe_path     TEXT    NOT NULL,
        bg_video     TEXT    NOT NULL,
        icon         TEXT    NOT NULL,
        poster       TEXT    NOT NULL,
        box_art      TEXT    NOT NULL,
        show_on_main INTEGER NOT NULL,
        created_at   INTEGER NOT NULL,
        sort_order   INTEGER NOT NULL
    );

    CREATE TABLE game_settings (
        game_id    TEXT    PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
        settings   TEXT    NOT NULL,
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE custom_servers (
        realmlist  TEXT    PRIMARY KEY,
        name       TEXT    NOT NULL,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE custom_realms (
        realmlist TEXT    NOT NULL REFERENCES custom_servers(realmlist) ON DELETE CASCADE,
        name      TEXT    NOT NULL,
        position  INTEGER NOT NULL,
        PRIMARY KEY (realmlist, name)
    );
    ",
];

/// Apply every migration newer than the database's current version.
///
/// # Errors
///
/// Fails when a migration statement fails; the failing migration is rolled back.
pub fn apply(connection: &mut Connection) -> AppResult<()> {
    let current: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;

    for (version, sql) in (1_i64..).zip(MIGRATIONS) {
        if version <= current {
            continue;
        }
        let transaction = connection.transaction()?;
        transaction.execute_batch(sql)?;
        transaction.pragma_update(None, "user_version", version)?;
        transaction.commit()?;
        tracing::info!(version, "Applied database migration");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_idempotent() -> AppResult<()> {
        let mut connection = Connection::open_in_memory()?;
        apply(&mut connection)?;
        apply(&mut connection)?;
        let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        assert_eq!(usize::try_from(version).ok(), Some(MIGRATIONS.len()));
        Ok(())
    }
}
