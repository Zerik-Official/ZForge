//! Game accounts: saving them with their password and preparing automatic logins.

use crate::domain::account::{Account, AccountDraft, AccountSummary, LaunchChoice, SavedCharacter};
use crate::domain::now_millis;
use crate::error::{AppError, AppResult};
use crate::services::credentials::{self, Password};
use crate::services::session::{AutoLogin, CharactersSeen};
use crate::storage::Database;

/// Every account with its saved characters and whether it has a password.
///
/// # Errors
///
/// Fails when the database query fails.
pub fn list(database: &Database) -> AppResult<Vec<AccountSummary>> {
    database
        .list_accounts()?
        .into_iter()
        .map(|account| {
            let has_password = match credentials::load(&account.id) {
                Ok(password) => password.is_some(),
                Err(error) => {
                    tracing::warn!(%error, account_id = %account.id, "Could not read an account password");
                    false
                }
            };
            Ok(AccountSummary {
                characters: database.list_characters(&account.id)?,
                has_password,
                account,
            })
        })
        .collect()
}

fn validate(draft: &AccountDraft) -> AppResult<()> {
    if draft.realmlist.trim().is_empty() || draft.username.trim().is_empty() {
        return Err(AppError::AccountInvalid);
    }
    Ok(())
}

/// Create an account or update an existing one. A password replaces the
/// stored one; `None` keeps it.
///
/// # Errors
///
/// Returns [`AppError::AccountInvalid`] without server or login name,
/// [`AppError::AccountExists`] for a duplicate login name and
/// [`AppError::Credential`] when the password cannot be stored.
pub fn save(
    database: &Database,
    id: Option<&str>,
    draft: AccountDraft,
    password: Option<Password>,
) -> AppResult<Account> {
    validate(&draft)?;
    let password = password.filter(|password| !password.expose().is_empty());
    match id {
        Some(id) => {
            let account = database.update_account(id, draft)?;
            if let Some(password) = &password {
                credentials::save(&account.id, &account.username, password)?;
            }
            Ok(account)
        }
        None => {
            let account = database.insert_account(draft)?;
            if let Some(password) = &password
                && let Err(error) = credentials::save(&account.id, &account.username, password)
            {
                database.delete_account(&account.id)?;
                return Err(error);
            }
            tracing::info!(account_id = %account.id, "Account added");
            Ok(account)
        }
    }
}

/// Delete an account, its characters and its password.
///
/// # Errors
///
/// Fails when the password or the account cannot be deleted.
pub fn delete(database: &Database, id: &str) -> AppResult<()> {
    credentials::delete(id)?;
    database.delete_account(id)?;
    tracing::info!(account_id = %id, "Account deleted");
    Ok(())
}

/// Save the characters read after an automatic login.
///
/// # Errors
///
/// Fails when the database write fails.
pub fn store_characters(database: &Database, seen: &CharactersSeen) -> AppResult<()> {
    let updated_at = now_millis();
    let characters: Vec<SavedCharacter> = seen
        .characters
        .iter()
        .filter(|character| !character.name.is_empty())
        .map(|character| SavedCharacter {
            realm: seen.realm.clone(),
            name: character.name.clone(),
            slot: character.index,
            level: character.level,
            race_id: character.race,
            class_id: character.class,
            gender: character.gender,
            map_id: character.map,
            zone_id: character.zone,
            updated_at,
        })
        .collect();
    database.replace_characters(&seen.account_id, &seen.realm, &characters)
}

/// The automatic login of a launch choice, or `None` when it uses no account.
///
/// `fallback_realm` is the realm saved in the game settings, used when
/// neither the choice nor the account names one.
///
/// # Errors
///
/// Returns [`AppError::NotFound`] for an unknown account and
/// [`AppError::PasswordMissing`] when it has no stored password.
pub fn auto_login(
    database: &Database,
    choice: &LaunchChoice,
    fallback_realm: &str,
) -> AppResult<Option<AutoLogin>> {
    let Some(account_id) = choice.account_id.as_deref() else {
        return Ok(None);
    };
    let account = database
        .get_account(account_id)?
        .ok_or_else(|| AppError::NotFound {
            entity: "account",
            id: account_id.to_owned(),
        })?;
    let password = credentials::load(&account.id)?
        .ok_or_else(|| AppError::PasswordMissing(account.id.clone()))?;
    let realm = [
        choice.realm.trim(),
        account.default_realm.as_str(),
        fallback_realm.trim(),
    ]
    .into_iter()
    .find(|realm| !realm.is_empty())
    .unwrap_or_default()
    .to_owned();
    Ok(Some(AutoLogin {
        account_id: account.id,
        username: account.username,
        password,
        realmlist: account.realmlist,
        realm,
        character: choice.character.trim().to_owned(),
        headless: choice.headless,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::sdk::api::SdkCharacter;

    fn draft() -> AccountDraft {
        AccountDraft {
            realmlist: "logon.example".to_owned(),
            username: "player".to_owned(),
            label: String::new(),
            default_realm: String::new(),
            default_character: String::new(),
        }
    }

    #[test]
    fn rejects_accounts_without_server_or_name() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        let missing = AccountDraft {
            username: " ".to_owned(),
            ..draft()
        };
        assert!(matches!(
            save(&database, None, missing, None),
            Err(AppError::AccountInvalid)
        ));
        Ok(())
    }

    #[test]
    fn builds_automatic_logins() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        assert_eq!(auto_login(&database, &LaunchChoice::default(), "")?, None);

        let account = save(&database, None, draft(), None)?;
        let choice = LaunchChoice {
            account_id: Some(account.id.clone()),
            realm: String::new(),
            character: " Jaina ".to_owned(),
            headless: true,
        };
        assert!(matches!(
            auto_login(&database, &choice, "Alpha"),
            Err(AppError::PasswordMissing(_))
        ));

        credentials::save(&account.id, "player", &Password::new("secret".to_owned()))?;
        let login = auto_login(&database, &choice, "Alpha");
        delete(&database, &account.id)?;
        let login = login?.ok_or(AppError::AccountInvalid)?;
        assert_eq!(login.realm, "Alpha");
        assert_eq!(login.character, "Jaina");
        assert_eq!(login.password.expose(), "secret");
        assert!(login.headless);
        assert_eq!(credentials::load(&account.id)?, None);
        Ok(())
    }

    #[test]
    fn stores_named_characters() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        let account = save(&database, None, draft(), None)?;
        let seen = CharactersSeen {
            account_id: account.id.clone(),
            realm: "Alpha".to_owned(),
            characters: vec![
                SdkCharacter {
                    index: 1,
                    name: "Jaina".to_owned(),
                    level: 80,
                    class: 8,
                    ..SdkCharacter::default()
                },
                SdkCharacter::default(),
            ],
        };
        store_characters(&database, &seen)?;
        let saved = database.list_characters(&account.id)?;
        assert_eq!(saved.len(), 1);
        assert_eq!((saved[0].slot, saved[0].class_id), (1, 8));
        Ok(())
    }
}
