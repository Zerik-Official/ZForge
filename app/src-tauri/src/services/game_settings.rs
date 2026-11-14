//! Per-game settings: the launcher's copy in the database and the game files.

use serde::Serialize;

use crate::domain::game::Game;
use crate::domain::game_settings::{SettingsValues, StoredGameSettings};
use crate::error::{AppError, AppResult};
use crate::services::game_config::{self, DynamicDefaults, GameFiles};
use crate::services::settings_schema::SchemaRegistry;
use crate::storage::Database;

/// Shared dependencies of every settings operation.
#[derive(Debug, Clone, Copy)]
pub struct SettingsContext<'a> {
    /// Launcher database.
    pub database: &'a Database,
    /// Bundled settings schemas.
    pub schemas: &'a SchemaRegistry,
    /// Machine-dependent defaults.
    pub dynamic: &'a DynamicDefaults,
}

/// Which copy of the settings should win a conflict.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ConflictSide {
    /// The launcher database.
    Db,
    /// The game's `.wtf` files.
    Game,
}

/// The launcher copy and the game files disagree and the user must choose.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ConfigConflict {
    /// Identifier of the game.
    pub game_id: String,
    /// Game display name.
    pub name: String,
    /// Expansion key.
    pub expansion: String,
    /// Suggested winner.
    pub recommended: ConflictSide,
    /// Settings stored by the launcher.
    pub db_settings: SettingsValues,
    /// Settings read from the game files.
    pub game_settings: SettingsValues,
}

impl SettingsContext<'_> {
    fn game(&self, game_id: &str) -> AppResult<Game> {
        self.database
            .get_game(game_id)?
            .ok_or_else(|| AppError::NotFound {
                entity: "game",
                id: game_id.to_owned(),
            })
    }

    /// Saved settings of a game, completed with defaults for any new setting.
    ///
    /// # Errors
    ///
    /// Fails when the game does not exist or the database query fails.
    pub fn get(&self, game_id: &str) -> AppResult<Option<SettingsValues>> {
        let game = self.game(game_id)?;
        let schema = self.schemas.for_expansion(&game.expansion);
        Ok(self
            .database
            .get_game_settings(game_id)?
            .map(|stored| game_config::normalize(schema, &stored.values, self.dynamic)))
    }

    /// Normalize and store settings edited in the launcher.
    ///
    /// # Errors
    ///
    /// Fails when the game does not exist or the write fails.
    pub fn save(&self, game_id: &str, values: &SettingsValues) -> AppResult<StoredGameSettings> {
        let game = self.game(game_id)?;
        let schema = self.schemas.for_expansion(&game.expansion);
        self.database.save_game_settings(
            game_id,
            &game_config::normalize(schema, values, self.dynamic),
        )
    }

    /// Settings currently in the game files, with launcher-only settings taken
    /// from `base` (or defaults when there is no base).
    fn scan_over(&self, game: &Game, base: Option<&SettingsValues>) -> AppResult<SettingsValues> {
        let schema = self.schemas.for_expansion(&game.expansion);
        let mut values = match base {
            Some(base) => game_config::normalize(schema, base, self.dynamic),
            None => game_config::defaults(schema, self.dynamic),
        };
        values.extend(GameFiles::from_exe(&game.exe_path).scan(schema, self.dynamic)?);
        Ok(values)
    }

    /// Settings currently in the game files; launcher-only settings use defaults.
    ///
    /// # Errors
    ///
    /// Fails when the game does not exist or its files cannot be read.
    pub fn scan(&self, game_id: &str) -> AppResult<SettingsValues> {
        self.scan_over(&self.game(game_id)?, None)
    }

    /// Store the current game files as the first launcher copy of a new game.
    ///
    /// # Errors
    ///
    /// Fails when the game files cannot be read or the write fails.
    pub fn seed(&self, game: &Game) -> AppResult<()> {
        let values = self.scan_over(game, None)?;
        self.database.save_game_settings(&game.id, &values)?;
        Ok(())
    }

    /// Write the saved settings into the game files.
    ///
    /// # Errors
    ///
    /// Fails when the game or its saved settings do not exist, or a file write fails.
    pub fn apply(&self, game_id: &str) -> AppResult<()> {
        let game = self.game(game_id)?;
        let stored =
            self.database
                .get_game_settings(game_id)?
                .ok_or_else(|| AppError::NotFound {
                    entity: "game settings",
                    id: game_id.to_owned(),
                })?;
        let schema = self.schemas.for_expansion(&game.expansion);
        GameFiles::from_exe(&game.exe_path).apply(schema, &stored.values, self.dynamic)
    }

    /// Replace the saved file-backed settings with what the game files hold,
    /// keeping launcher-only settings.
    ///
    /// # Errors
    ///
    /// Fails when the game does not exist, its files cannot be read or the write fails.
    pub fn pull(&self, game_id: &str) -> AppResult<StoredGameSettings> {
        let game = self.game(game_id)?;
        let saved = self.database.get_game_settings(game_id)?;
        let values = self.scan_over(&game, saved.as_ref().map(|stored| &stored.values))?;
        self.database.save_game_settings(game_id, &values)
    }

    /// Compare the launcher copy with the game files.
    ///
    /// Without a launcher copy, the game files are stored. When both differ,
    /// the newer side wins automatically unless the launcher copy is newer, in
    /// which case the user is asked.
    ///
    /// # Errors
    ///
    /// Fails when the game files cannot be read or the database fails.
    pub fn reconcile(&self, game: &Game) -> AppResult<Option<ConfigConflict>> {
        let Some(saved) = self.database.get_game_settings(&game.id)? else {
            self.seed(game)?;
            return Ok(None);
        };
        let schema = self.schemas.for_expansion(&game.expansion);
        let db_settings = game_config::normalize(schema, &saved.values, self.dynamic);
        let game_settings = self.scan_over(game, Some(&saved.values))?;
        if game_config::file_backed(schema, &db_settings)
            == game_config::file_backed(schema, &game_settings)
        {
            return Ok(None);
        }

        let files_modified = GameFiles::from_exe(&game.exe_path)
            .config_modified_millis()
            .unwrap_or(0);
        if saved.updated_at >= files_modified {
            return Ok(Some(ConfigConflict {
                game_id: game.id.clone(),
                name: game.name.clone(),
                expansion: game.expansion.clone(),
                recommended: ConflictSide::Db,
                db_settings,
                game_settings,
            }));
        }
        self.database.save_game_settings(&game.id, &game_settings)?;
        tracing::info!(game_id = %game.id, "Game files are newer; launcher settings updated");
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use crate::domain::game::GameDraft;
    use crate::domain::game_settings::SettingValue;

    use super::*;

    struct Fixture {
        _directory: tempfile::TempDir,
        database: Database,
        schemas: SchemaRegistry,
        dynamic: DynamicDefaults,
        game: Game,
    }

    impl Fixture {
        fn new() -> AppResult<Self> {
            let directory = tempfile::tempdir()?;
            let database = Database::open_in_memory()?;
            let game = database.insert_game(GameDraft {
                name: "WoW".to_owned(),
                expansion: "wotlk".to_owned(),
                exe_path: directory
                    .path()
                    .join("Wow.exe")
                    .to_string_lossy()
                    .into_owned(),
                bg_video: String::new(),
                icon: String::new(),
                poster: String::new(),
                box_art: String::new(),
                show_on_main: true,
            })?;
            Ok(Self {
                _directory: directory,
                database,
                schemas: SchemaRegistry::load()?,
                dynamic: DynamicDefaults::default(),
                game,
            })
        }

        fn context(&self) -> SettingsContext<'_> {
            SettingsContext {
                database: &self.database,
                schemas: &self.schemas,
                dynamic: &self.dynamic,
            }
        }

        fn write_config(&self, contents: &str) -> AppResult<()> {
            let path = GameFiles::from_exe(&self.game.exe_path).config_wtf();
            fs::create_dir_all(path.parent().unwrap_or(Path::new(".")))?;
            fs::write(path, contents)?;
            Ok(())
        }
    }

    #[test]
    fn reconcile_seeds_then_detects_conflicts() -> AppResult<()> {
        let fixture = Fixture::new()?;
        let context = fixture.context();
        fixture.write_config("SET gxWindow \"1\"\n")?;

        assert_eq!(context.reconcile(&fixture.game)?, None);
        let seeded = context.get(&fixture.game.id)?.unwrap_or_default();
        assert_eq!(seeded["windowed"], SettingValue::Bool(true));

        let mut edited = seeded.clone();
        edited.insert("windowed".to_owned(), SettingValue::Bool(false));
        context.save(&fixture.game.id, &edited)?;

        let conflict = context.reconcile(&fixture.game)?;
        assert!(matches!(
            conflict,
            Some(ConfigConflict {
                recommended: ConflictSide::Db,
                ..
            })
        ));
        Ok(())
    }

    #[test]
    fn pull_keeps_launcher_only_settings_and_apply_writes_files() -> AppResult<()> {
        let fixture = Fixture::new()?;
        let context = fixture.context();
        let mut values = SettingsValues::new();
        values.insert(
            "launch_args".to_owned(),
            SettingValue::Text("-console".to_owned()),
        );
        values.insert("farclip".to_owned(), SettingValue::Int(500));
        context.save(&fixture.game.id, &values)?;
        context.apply(&fixture.game.id)?;

        fixture.write_config("SET farclip \"900\"\n")?;
        let pulled = context.pull(&fixture.game.id)?;
        assert_eq!(pulled.values["farclip"], SettingValue::Int(900));
        assert_eq!(
            pulled.values["launch_args"],
            SettingValue::Text("-console".to_owned())
        );
        Ok(())
    }
}
