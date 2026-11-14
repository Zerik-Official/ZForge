//! Game management rules on top of the game repository.

use crate::domain::game::{Game, GameDraft};
use crate::error::AppResult;
use crate::services::assets;
use crate::storage::Database;

/// Fill the box art from the expansion defaults when the draft leaves it empty.
fn with_default_box_art(mut draft: GameDraft) -> GameDraft {
    if draft.box_art.trim().is_empty()
        && let Some(media) = assets::expansion_media(&draft.expansion)
    {
        media.box_art.clone_into(&mut draft.box_art);
    }
    draft
}

/// Create a game at the end of the dock.
///
/// # Errors
///
/// Fails when the game cannot be stored.
pub fn create(database: &Database, draft: GameDraft) -> AppResult<Game> {
    let game = database.insert_game(with_default_box_art(draft))?;
    tracing::info!(game_id = %game.id, expansion = %game.expansion, "Game created");
    Ok(game)
}

/// Update the editable fields of an existing game.
///
/// # Errors
///
/// Fails when the game does not exist or cannot be stored.
pub fn update(database: &Database, id: &str, draft: GameDraft) -> AppResult<Game> {
    let game = database.update_game(id, with_default_box_art(draft))?;
    tracing::info!(game_id = %game.id, "Game updated");
    Ok(game)
}

/// Delete a game and its stored settings.
///
/// # Errors
///
/// Fails when the delete fails.
pub fn remove(database: &Database, id: &str) -> AppResult<()> {
    database.remove_game(id)?;
    tracing::info!(game_id = %id, "Game removed");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn draft(expansion: &str, box_art: &str) -> GameDraft {
        GameDraft {
            name: "WoW".to_owned(),
            expansion: expansion.to_owned(),
            exe_path: String::new(),
            bg_video: String::new(),
            icon: String::new(),
            poster: String::new(),
            box_art: box_art.to_owned(),
            show_on_main: true,
        }
    }

    #[test]
    fn applies_default_box_art_only_when_empty() -> AppResult<()> {
        let database = Database::open_in_memory()?;
        let defaulted = create(&database, draft("wotlk", ""))?;
        assert_eq!(defaulted.box_art, "/assets/games/boxes/wow_wotlk_box.png");

        let custom = update(&database, &defaulted.id, draft("wotlk", "C:/box.png"))?;
        assert_eq!(custom.box_art, "C:/box.png");

        let unknown = create(&database, draft("unknown", ""))?;
        assert_eq!(unknown.box_art, "");
        Ok(())
    }
}
