"""
Launcher and games API.

Thin API layer for game CRUD and launch. Delegates to storage and
services for the actual work.
"""

# Standard library
from __future__ import annotations

from datetime import datetime

# Project imports
from desktop.core import game_config
from desktop.core.errors import ErrorCode, handle_api_errors, make_error_string_envelope
from desktop.models.game import Game
from desktop.services.wow import launcher as wow_launcher
from desktop.storage import db as db_store
from desktop.utils.logger import Tags, log


def list_games() -> list[dict[str, object]]:
    """Return every saved game as a list of dictionaries."""
    log("DEBUG", Tags.API, "list_games() called")
    return [game.to_dict() for game in db_store.list_games()]


def add_game(payload: dict[str, object]) -> dict[str, object]:
    """
    Create and persist a new game.

    Args:
        payload: Game fields from the add/edit modal (id ignored).

    Returns:
        The created game as a dictionary.
    """
    game: Game = Game.from_payload(payload)  # type: ignore[arg-type]
    game.created_at = datetime.now().isoformat()
    db_store.add_game(game)
    try:
        db_store.save_game_settings(game.id, game_config.scan_game_config(game.exe_path))
        log("INFO", Tags.API, f"add_game() seeded settings -> {game.id}")
    except OSError as exc:
        log("WARNING", Tags.API, f"add_game() could not scan settings for {game.id}: {exc}")
    log("INFO", Tags.API, f"add_game() -> {game.id} ({game.expansion})")
    return game.to_dict()


def update_game(payload: dict[str, object]) -> dict[str, object]:
    """
    Update an existing game.

    Args:
        payload: Game fields; ``id`` selects the row to update.

    Returns:
        The updated game as a dictionary.
    """
    game: Game = Game.from_payload(payload)  # type: ignore[arg-type]
    db_store.update_game(game)
    log("INFO", Tags.API, f"update_game() -> {game.id}")
    return game.to_dict()


def remove_game(game_id: str) -> dict[str, object]:
    """
    Delete a game by id.

    Args:
        game_id: Identifier of the game to remove.

    Returns:
        Success envelope.
    """
    db_store.remove_game(game_id)
    log("INFO", Tags.API, f"remove_game() -> {game_id}")
    return {"ok": True, "error": None}


@handle_api_errors
def reorder_games(ordered_ids: list[str]) -> dict[str, object]:
    """
    Persist a new order for the dock.

    Args:
        ordered_ids: Game ids in the desired display order.

    Returns:
        Success envelope.
    """
    if not isinstance(ordered_ids, list):
        return make_error_string_envelope(ErrorCode.ORDERED_IDS_INVALID)
    db_store.reorder_games([str(gid) for gid in ordered_ids])
    log("INFO", Tags.API, f"reorder_games() -> {ordered_ids}")
    return {"ok": True, "error": None}


@handle_api_errors
def launch_game(game_id: str) -> dict[str, object]:
    """
    Start the WoW client for the selected game.

    Args:
        game_id: Identifier of the saved game to launch.

    Returns:
        Success envelope.
    """
    log("DEBUG", Tags.API, f"launch_game() called — id={game_id}")
    game: Game | None = db_store.get_game(game_id)
    if game is None:
        return make_error_string_envelope(ErrorCode.GAME_NOT_FOUND)
    return wow_launcher.launch_wow(game)