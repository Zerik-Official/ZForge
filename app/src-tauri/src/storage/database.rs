//! SQLite connection management.
//!
//! The database is opened once at startup and shared through Tauri state.
//! Repository methods live in sibling modules as `impl Database` blocks.

use std::fs;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::error::{AppError, AppResult};
use crate::storage::migrations;

/// Thread-safe handle to the launcher database.
#[derive(Debug)]
pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    /// Open (or create) the database file and apply pending migrations.
    ///
    /// # Errors
    ///
    /// Fails when the parent directory cannot be created, the file cannot be
    /// opened or a migration fails.
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let database = Self::initialize(Connection::open(path)?)?;
        tracing::info!(path = %path.display(), "Database opened");
        Ok(database)
    }

    /// Open a private in-memory database with the current schema.
    ///
    /// # Errors
    ///
    /// Fails when a migration fails.
    pub fn open_in_memory() -> AppResult<Self> {
        Self::initialize(Connection::open_in_memory()?)
    }

    fn initialize(mut connection: Connection) -> AppResult<Self> {
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        migrations::apply(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    /// Run a closure with exclusive access to the connection.
    pub(crate) fn with_connection<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> AppResult<T>,
    ) -> AppResult<T> {
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| AppError::LockPoisoned("database connection"))?;
        operation(&mut connection)
    }
}
