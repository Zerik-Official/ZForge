//! Account, character and launch choice repository.

use rusqlite::{Connection, ErrorCode, OptionalExtension, Row, params};
use uuid::Uuid;

use crate::domain::account::{Account, AccountDraft, LaunchChoice, SavedCharacter};
use crate::domain::now_millis;
use crate::error::{AppError, AppResult};
use crate::storage::Database;

const SELECT_ACCOUNT: &str = "SELECT id, realmlist, username, label, default_realm, \
     default_character, created_at FROM accounts";

fn account_from_row(row: &Row<'_>) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get(0)?,
        realmlist: row.get(1)?,
        username: row.get(2)?,
        label: row.get(3)?,
        default_realm: row.get(4)?,
        default_character: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn find_account(connection: &Connection, id: &str) -> AppResult<Option<Account>> {
    let account = connection
        .query_row(
            &format!("{SELECT_ACCOUNT} WHERE id = ?1"),
            [id],
            account_from_row,
        )
        .optional()?;
    Ok(account)
}

/// Map a unique constraint failure to [`AppError::AccountExists`].
fn duplicate_as_exists(error: rusqlite::Error) -> AppError {
    match error {
        rusqlite::Error::SqliteFailure(failure, _)
            if failure.code == ErrorCode::ConstraintViolation =>
        {
            AppError::AccountExists
        }
        other => other.into(),
    }
}

fn trimmed(draft: AccountDraft) -> AccountDraft {
    AccountDraft {
        realmlist: draft.realmlist.trim().to_owned(),
        username: draft.username.trim().to_owned(),
        label: draft.label.trim().to_owned(),
        default_realm: draft.default_realm.trim().to_owned(),
        default_character: draft.default_character.trim().to_owned(),
    }
}

impl Database {
    /// Every account ordered by server, then creation time.
    ///
    /// # Errors
    ///
    /// Fails when the query fails.
    pub fn list_accounts(&self) -> AppResult<Vec<Account>> {
        self.with_connection(|connection| {
            let mut statement = connection.prepare(&format!(
                "{SELECT_ACCOUNT} ORDER BY realmlist ASC, created_at ASC"
            ))?;
            let accounts = statement
                .query_map([], account_from_row)?
                .collect::<rusqlite::Result<Vec<Account>>>()?;
            Ok(accounts)
        })
    }

    /// A single account by identifier.
    ///
    /// # Errors
    ///
    /// Fails when the query fails.
    pub fn get_account(&self, id: &str) -> AppResult<Option<Account>> {
        self.with_connection(|connection| find_account(connection, id))
    }

    /// Create an account.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::AccountExists`] when the server already has an
    /// account with that login name.
    pub fn insert_account(&self, draft: AccountDraft) -> AppResult<Account> {
        let draft = trimmed(draft);
        let account = Account {
            id: Uuid::new_v4().to_string(),
            realmlist: draft.realmlist,
            username: draft.username,
            label: draft.label,
            default_realm: draft.default_realm,
            default_character: draft.default_character,
            created_at: now_millis(),
        };
        self.with_connection(|connection| {
            connection
                .execute(
                    "INSERT INTO accounts (id, realmlist, username, label, default_realm, \
                     default_character, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        account.id,
                        account.realmlist,
                        account.username,
                        account.label,
                        account.default_realm,
                        account.default_character,
                        account.created_at,
                    ],
                )
                .map_err(duplicate_as_exists)?;
            Ok(account)
        })
    }

    /// Replace the editable fields of an account.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::NotFound`] when the account does not exist and
    /// [`AppError::AccountExists`] when the new login name is taken.
    pub fn update_account(&self, id: &str, draft: AccountDraft) -> AppResult<Account> {
        let draft = trimmed(draft);
        self.with_connection(|connection| {
            let changed = connection
                .execute(
                    "UPDATE accounts SET realmlist = ?2, username = ?3, label = ?4, \
                     default_realm = ?5, default_character = ?6 WHERE id = ?1",
                    params![
                        id,
                        draft.realmlist,
                        draft.username,
                        draft.label,
                        draft.default_realm,
                        draft.default_character,
                    ],
                )
                .map_err(duplicate_as_exists)?;
            if changed == 0 {
                return Err(AppError::NotFound {
                    entity: "account",
                    id: id.to_owned(),
                });
            }
            find_account(connection, id)?.ok_or_else(|| AppError::NotFound {
                entity: "account",
                id: id.to_owned(),
            })
        })
    }

    /// Delete an account with its characters; a no-op when it does not exist.
    ///
    /// # Errors
    ///
    /// Fails when the delete fails.
    pub fn delete_account(&self, id: &str) -> AppResult<()> {
        self.with_connection(|connection| {
            connection.execute("DELETE FROM accounts WHERE id = ?1", [id])?;
            Ok(())
        })
    }

    /// Saved characters of an account, ordered by realm and slot.
    ///
    /// # Errors
    ///
    /// Fails when the query fails.
    pub fn list_characters(&self, account_id: &str) -> AppResult<Vec<SavedCharacter>> {
        self.with_connection(|connection| {
            let mut statement = connection.prepare(
                "SELECT realm, name, slot, level, race_id, class_id, gender, map_id, zone_id, \
                 updated_at FROM characters WHERE account_id = ?1 ORDER BY realm ASC, slot ASC",
            )?;
            let characters = statement
                .query_map([account_id], |row| {
                    Ok(SavedCharacter {
                        realm: row.get(0)?,
                        name: row.get(1)?,
                        slot: row.get(2)?,
                        level: row.get(3)?,
                        race_id: row.get(4)?,
                        class_id: row.get(5)?,
                        gender: row.get(6)?,
                        map_id: row.get(7)?,
                        zone_id: row.get(8)?,
                        updated_at: row.get(9)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<SavedCharacter>>>()?;
            Ok(characters)
        })
    }

    /// Replace the characters saved for one realm of an account.
    ///
    /// # Errors
    ///
    /// Fails when the transaction fails, for example when the account was deleted.
    pub fn replace_characters(
        &self,
        account_id: &str,
        realm: &str,
        characters: &[SavedCharacter],
    ) -> AppResult<()> {
        self.with_connection(|connection| {
            let transaction = connection.transaction()?;
            transaction.execute(
                "DELETE FROM characters WHERE account_id = ?1 AND realm = ?2",
                params![account_id, realm],
            )?;
            for character in characters {
                transaction.execute(
                    "INSERT OR REPLACE INTO characters (account_id, realm, name, slot, level, \
                     race_id, class_id, gender, map_id, zone_id, updated_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        account_id,
                        realm,
                        character.name,
                        character.slot,
                        character.level,
                        character.race_id,
                        character.class_id,
                        character.gender,
                        character.map_id,
                        character.zone_id,
                        character.updated_at,
                    ],
                )?;
            }
            transaction.commit()?;
            Ok(())
        })
    }

    /// The last launch choice of a game; the default when none was saved.
    ///
    /// # Errors
    ///
    /// Fails when the query fails.
    pub fn get_launch_choice(&self, game_id: &str) -> AppResult<LaunchChoice> {
        self.with_connection(|connection| {
            let choice = connection
                .query_row(
                    "SELECT account_id, realm, character, headless FROM launch_choices \
                     WHERE game_id = ?1",
                    [game_id],
                    |row| {
                        Ok(LaunchChoice {
                            account_id: row.get(0)?,
                            realm: row.get(1)?,
                            character: row.get(2)?,
                            headless: row.get(3)?,
                        })
                    },
                )
                .optional()?;
            Ok(choice.unwrap_or_default())
        })
    }

    /// Remember how a game was launched.
    ///
    /// # Errors
    ///
    /// Fails when the write fails, for example when the game or account does not exist.
    pub fn save_launch_choice(&self, game_id: &str, choice: &LaunchChoice) -> AppResult<()> {
        self.with_connection(|connection| {
            connection.execute(
                "INSERT INTO launch_choices (game_id, account_id, realm, character, headless) \
                 VALUES (?1, ?2, ?3, ?4, ?5) \
                 ON CONFLICT (game_id) DO UPDATE SET account_id = excluded.account_id, \
                 realm = excluded.realm, character = excluded.character, \
                 headless = excluded.headless",
                params![
                    game_id,
                    choice.account_id,
                    choice.realm,
                    choice.character,
                    choice.headless,
                ],
            )?;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::game::GameDraft;

    fn draft(username: &str) -> AccountDraft {
        AccountDraft {
            realmlist: " logon.example ".to_owned(),
            username: username.to_owned(),
            label: String::new(),
            default_realm: "Alpha".to_owned(),
            default_character: String::new(),
        }
    }

    fn character(name: &str, slot: u32) -> SavedCharacter {
        SavedCharacter {
            realm: "Alpha".to_owned(),
            name: name.to_owned(),
            slot,
            level: 80,
            race_id: 1,
            class_id: 2,
            gender: 0,
            map_id: 571,
            zone_id: 4395,
            updated_at: 1,
        }
    }

    #[test]
    fn saves_updates_and_deletes_accounts() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        let account = database.insert_account(draft("player"))?;
        assert_eq!(account.realmlist, "logon.example");
        assert!(matches!(
            database.insert_account(draft("player")),
            Err(AppError::AccountExists)
        ));

        let other = database.insert_account(draft("alt"))?;
        assert!(matches!(
            database.update_account(&other.id, draft("player")),
            Err(AppError::AccountExists)
        ));
        let renamed = database.update_account(
            &other.id,
            AccountDraft {
                label: "Main".to_owned(),
                ..draft("second")
            },
        )?;
        assert_eq!(
            (renamed.username.as_str(), renamed.label.as_str()),
            ("second", "Main")
        );
        assert!(matches!(
            database.update_account("missing", draft("x")),
            Err(AppError::NotFound { .. })
        ));

        database.delete_account(&account.id)?;
        assert_eq!(database.list_accounts()?, vec![renamed]);
        Ok(())
    }

    #[test]
    fn replaces_characters_per_realm() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        let account = database.insert_account(draft("player"))?;
        database.replace_characters(&account.id, "Alpha", &[character("Old", 0)])?;
        database.replace_characters(
            &account.id,
            "Alpha",
            &[character("Thrall", 1), character("Jaina", 0)],
        )?;
        let other_realm = SavedCharacter {
            realm: "Beta".to_owned(),
            ..character("Arthas", 0)
        };
        database.replace_characters(&account.id, "Beta", &[other_realm])?;

        let names: Vec<String> = database
            .list_characters(&account.id)?
            .into_iter()
            .map(|character| format!("{}/{}", character.realm, character.name))
            .collect();
        assert_eq!(names, ["Alpha/Jaina", "Alpha/Thrall", "Beta/Arthas"]);

        database.delete_account(&account.id)?;
        assert!(database.list_characters(&account.id)?.is_empty());
        Ok(())
    }

    #[test]
    fn remembers_launch_choices() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        let game = database.insert_game(GameDraft {
            name: "WoW".to_owned(),
            expansion: "wotlk".to_owned(),
            exe_path: String::new(),
            bg_video: String::new(),
            icon: String::new(),
            poster: String::new(),
            box_art: String::new(),
            show_on_main: true,
        })?;
        assert_eq!(
            database.get_launch_choice(&game.id)?,
            LaunchChoice::default()
        );

        let account = database.insert_account(draft("player"))?;
        let choice = LaunchChoice {
            account_id: Some(account.id.clone()),
            realm: "Alpha".to_owned(),
            character: "Jaina".to_owned(),
            headless: true,
        };
        database.save_launch_choice(&game.id, &choice)?;
        assert_eq!(database.get_launch_choice(&game.id)?, choice);

        database.delete_account(&account.id)?;
        assert_eq!(database.get_launch_choice(&game.id)?.account_id, None);
        Ok(())
    }
}
