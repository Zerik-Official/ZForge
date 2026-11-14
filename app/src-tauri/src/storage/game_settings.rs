//! Per-game settings repository.

use rusqlite::{OptionalExtension, params};

use crate::domain::game_settings::{SettingsValues, StoredGameSettings};
use crate::domain::now_millis;
use crate::error::AppResult;
use crate::storage::Database;

impl Database {
    /// Saved settings for a game, or `None` when nothing is stored yet.
    ///
    /// # Errors
    ///
    /// Fails when the query fails or the stored JSON is invalid.
    pub fn get_game_settings(&self, game_id: &str) -> AppResult<Option<StoredGameSettings>> {
        self.with_connection(|connection| {
            let row: Option<(String, i64)> = connection
                .query_row(
                    "SELECT settings, updated_at FROM game_settings WHERE game_id = ?1",
                    [game_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?;
            row.map(|(json, updated_at)| {
                Ok(StoredGameSettings {
                    game_id: game_id.to_owned(),
                    values: serde_json::from_str(&json)?,
                    updated_at,
                })
            })
            .transpose()
        })
    }

    /// Insert or replace the settings of a game, stamping the update time.
    ///
    /// # Errors
    ///
    /// Fails when the game does not exist or the write fails.
    pub fn save_game_settings(
        &self,
        game_id: &str,
        values: &SettingsValues,
    ) -> AppResult<StoredGameSettings> {
        let json = serde_json::to_string(values)?;
        let updated_at = now_millis();
        self.with_connection(|connection| {
            connection.execute(
                "INSERT INTO game_settings (game_id, settings, updated_at) VALUES (?1, ?2, ?3) \
                 ON CONFLICT(game_id) DO UPDATE SET \
                 settings = excluded.settings, updated_at = excluded.updated_at",
                params![game_id, json, updated_at],
            )?;
            Ok(())
        })?;
        tracing::debug!(game_id, keys = values.len(), "Game settings saved");
        Ok(StoredGameSettings {
            game_id: game_id.to_owned(),
            values: values.clone(),
            updated_at,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::domain::game::GameDraft;
    use crate::domain::game_settings::SettingValue;

    use super::*;

    #[test]
    fn saves_loads_and_cascades() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        let game = database.insert_game(GameDraft {
            name: "WoW".to_owned(),
            expansion: "wotlk".to_owned(),
            exe_path: String::new(),
            bg_video: String::new(),
            icon: String::new(),
            poster: String::new(),
            box_art: String::new(),
            show_on_main: false,
        })?;
        assert_eq!(database.get_game_settings(&game.id)?, None);

        let mut values = SettingsValues::new();
        values.insert("vsync".to_owned(), SettingValue::Bool(false));
        let saved = database.save_game_settings(&game.id, &values)?;
        assert_eq!(database.get_game_settings(&game.id)?, Some(saved));

        database.remove_game(&game.id)?;
        assert_eq!(database.get_game_settings(&game.id)?, None);
        Ok(())
    }
}
