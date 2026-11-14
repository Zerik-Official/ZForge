//! Game repository.

use rusqlite::{Connection, OptionalExtension, Row, params};
use uuid::Uuid;

use crate::domain::game::{Game, GameDraft};
use crate::domain::now_millis;
use crate::error::{AppError, AppResult};
use crate::storage::Database;

const SELECT_GAME: &str = "SELECT id, name, expansion, exe_path, bg_video, icon, poster, \
     box_art, show_on_main, created_at, sort_order FROM games";

fn game_from_row(row: &Row<'_>) -> rusqlite::Result<Game> {
    Ok(Game {
        id: row.get(0)?,
        name: row.get(1)?,
        expansion: row.get(2)?,
        exe_path: row.get(3)?,
        bg_video: row.get(4)?,
        icon: row.get(5)?,
        poster: row.get(6)?,
        box_art: row.get(7)?,
        show_on_main: row.get(8)?,
        created_at: row.get(9)?,
        sort_order: row.get(10)?,
    })
}

fn find_game(connection: &Connection, id: &str) -> AppResult<Option<Game>> {
    let game = connection
        .query_row(&format!("{SELECT_GAME} WHERE id = ?1"), [id], game_from_row)
        .optional()?;
    Ok(game)
}

impl Database {
    /// Every saved game ordered by dock position, then creation time.
    ///
    /// # Errors
    ///
    /// Fails when the query fails.
    pub fn list_games(&self) -> AppResult<Vec<Game>> {
        self.with_connection(|connection| {
            let mut statement = connection.prepare(&format!(
                "{SELECT_GAME} ORDER BY sort_order ASC, created_at ASC"
            ))?;
            let games = statement
                .query_map([], game_from_row)?
                .collect::<rusqlite::Result<Vec<Game>>>()?;
            Ok(games)
        })
    }

    /// A single game by identifier.
    ///
    /// # Errors
    ///
    /// Fails when the query fails.
    pub fn get_game(&self, id: &str) -> AppResult<Option<Game>> {
        self.with_connection(|connection| find_game(connection, id))
    }

    /// Create a game at the end of the dock.
    ///
    /// # Errors
    ///
    /// Fails when the insert fails.
    pub fn insert_game(&self, draft: GameDraft) -> AppResult<Game> {
        self.with_connection(|connection| {
            let next_order: i64 = connection.query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM games",
                [],
                |row| row.get(0),
            )?;
            let mut game = Game {
                id: Uuid::new_v4().to_string(),
                name: String::new(),
                expansion: String::new(),
                exe_path: String::new(),
                bg_video: String::new(),
                icon: String::new(),
                poster: String::new(),
                box_art: String::new(),
                show_on_main: false,
                created_at: now_millis(),
                sort_order: next_order,
            };
            game.apply_draft(draft);
            connection.execute(
                "INSERT INTO games (id, name, expansion, exe_path, bg_video, icon, poster, \
                 box_art, show_on_main, created_at, sort_order) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    game.id,
                    game.name,
                    game.expansion,
                    game.exe_path,
                    game.bg_video,
                    game.icon,
                    game.poster,
                    game.box_art,
                    game.show_on_main,
                    game.created_at,
                    game.sort_order,
                ],
            )?;
            Ok(game)
        })
    }

    /// Replace the editable fields of an existing game.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::NotFound`] when the game does not exist.
    pub fn update_game(&self, id: &str, draft: GameDraft) -> AppResult<Game> {
        self.with_connection(|connection| {
            let mut game = find_game(connection, id)?.ok_or_else(|| AppError::NotFound {
                entity: "game",
                id: id.to_owned(),
            })?;
            game.apply_draft(draft);
            connection.execute(
                "UPDATE games SET name = ?1, expansion = ?2, exe_path = ?3, bg_video = ?4, \
                 icon = ?5, poster = ?6, box_art = ?7, show_on_main = ?8 WHERE id = ?9",
                params![
                    game.name,
                    game.expansion,
                    game.exe_path,
                    game.bg_video,
                    game.icon,
                    game.poster,
                    game.box_art,
                    game.show_on_main,
                    game.id,
                ],
            )?;
            Ok(game)
        })
    }

    /// Persist a new dock order; ids not listed keep their current position.
    ///
    /// # Errors
    ///
    /// Fails when the transaction fails.
    pub fn reorder_games(&self, ordered_ids: &[String]) -> AppResult<()> {
        self.with_connection(|connection| {
            let transaction = connection.transaction()?;
            {
                let mut statement =
                    transaction.prepare("UPDATE games SET sort_order = ?1 WHERE id = ?2")?;
                for (position, id) in (0_i64..).zip(ordered_ids) {
                    statement.execute(params![position, id])?;
                }
            }
            transaction.commit()?;
            Ok(())
        })
    }

    /// Delete a game and its settings.
    ///
    /// # Errors
    ///
    /// Fails when the delete fails.
    pub fn remove_game(&self, id: &str) -> AppResult<()> {
        self.with_connection(|connection| {
            connection.execute("DELETE FROM games WHERE id = ?1", [id])?;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn draft(name: &str) -> GameDraft {
        GameDraft {
            name: name.to_owned(),
            expansion: "wotlk".to_owned(),
            exe_path: "C:/WoW/Wow.exe".to_owned(),
            bg_video: String::new(),
            icon: String::new(),
            poster: String::new(),
            box_art: String::new(),
            show_on_main: true,
        }
    }

    #[test]
    fn inserts_in_dock_order() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        let first = database.insert_game(draft("First"))?;
        let second = database.insert_game(draft("Second"))?;
        assert_eq!((first.sort_order, second.sort_order), (0, 1));
        assert_eq!(database.list_games()?, vec![first, second]);
        Ok(())
    }

    #[test]
    fn updates_and_reports_missing_games() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        let game = database.insert_game(draft("Before"))?;
        let updated = database.update_game(&game.id, draft("After"))?;
        assert_eq!(updated.name, "After");
        assert_eq!(updated.created_at, game.created_at);
        assert!(matches!(
            database.update_game("missing", draft("x")),
            Err(AppError::NotFound { .. })
        ));
        Ok(())
    }

    #[test]
    fn reorders_and_removes() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        let a = database.insert_game(draft("A"))?;
        let b = database.insert_game(draft("B"))?;
        database.reorder_games(&[b.id.clone(), a.id.clone()])?;
        let names: Vec<String> = database.list_games()?.into_iter().map(|g| g.name).collect();
        assert_eq!(names, ["B", "A"]);
        database.remove_game(&a.id)?;
        assert_eq!(database.get_game(&a.id)?, None);
        Ok(())
    }
}
