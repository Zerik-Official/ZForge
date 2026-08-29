"""
SQLite persistence for user-added games.

The database lives at ``%APPDATA%/ZForge/database/database.db``. This module
owns the schema and the CRUD operations; higher layers (API bridge, future
services) call into it.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from desktop.models.game import Game
from desktop.utils.paths import db_path


def _connect() -> sqlite3.Connection:
    """Open a connection, ensuring its parent directory exists."""
    db_path().parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path()))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create the ``games`` table if it does not exist yet."""
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS games (
                id           TEXT PRIMARY KEY,
                name         TEXT NOT NULL,
                expansion    TEXT NOT NULL,
                exe_path     TEXT NOT NULL,
                bg_video     TEXT NOT NULL,
                icon         TEXT NOT NULL,
                poster       TEXT NOT NULL,
                show_on_main INTEGER NOT NULL DEFAULT 0,
                created_at   TEXT NOT NULL DEFAULT ''
            )
            """
        )


def list_games() -> list[Game]:
    """Return every saved game, ordered by creation time."""
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM games ORDER BY created_at ASC").fetchall()
    return [Game.from_row(dict(row)) for row in rows]


def get_game(game_id: str) -> Game | None:
    """Return a single game by id, or ``None`` if not found."""
    with _connect() as conn:
        row = conn.execute("SELECT * FROM games WHERE id = ?", (game_id,)).fetchone()
    return Game.from_row(dict(row)) if row else None


def add_game(game: Game) -> Game:
    """
    Insert a new game row.

    Args:
        game: Fully-populated ``Game`` instance.

    Returns:
        The same ``Game`` instance (with its generated id).
    """
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO games
                (id, name, expansion, exe_path, bg_video, icon, poster,
                 show_on_main, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                game.id,
                game.name,
                game.expansion,
                game.exe_path,
                game.bg_video,
                game.icon,
                game.poster,
                1 if game.show_on_main else 0,
                game.created_at,
            ),
        )
    return game


def update_game(game: Game) -> Game:
    """
    Update an existing game row (matched by id).

    Args:
        game: ``Game`` instance with the fields to persist.

    Returns:
        The same ``Game`` instance.
    """
    with _connect() as conn:
        conn.execute(
            """
            UPDATE games SET
                name = ?, expansion = ?, exe_path = ?, bg_video = ?,
                icon = ?, poster = ?, show_on_main = ?
            WHERE id = ?
            """,
            (
                game.name,
                game.expansion,
                game.exe_path,
                game.bg_video,
                game.icon,
                game.poster,
                1 if game.show_on_main else 0,
                game.id,
            ),
        )
    return game


def remove_game(game_id: str) -> None:
    """
    Delete a game by id.

    Args:
        game_id: Identifier of the game to remove.
    """
    with _connect() as conn:
        conn.execute("DELETE FROM games WHERE id = ?", (game_id,))
