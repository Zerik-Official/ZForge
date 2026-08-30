"""
SQLite persistence for user-added games.

The database lives at ``%APPDATA%/ZForge/database/database.db``. This module
owns the schema and the CRUD operations; higher layers (API bridge, future
services) call into it.
"""

# Standard library
from __future__ import annotations
import json
import sqlite3
from datetime import datetime
from typing import Any

# Project imports
from desktop.models.game import Game
from desktop.utils.paths import db_path


def _connect() -> sqlite3.Connection:
    """Open a connection, ensuring its parent directory exists."""
    db_path().parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path()))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create the ``games`` and ``game_settings`` tables if they do not exist yet."""
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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS game_settings (
                game_id    TEXT PRIMARY KEY,
                settings   TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT ''
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS custom_servers (
                realmlist  TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                realms     TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT ''
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
        conn.execute("DELETE FROM game_settings WHERE game_id = ?", (game_id,))


def get_game_settings(game_id: str) -> dict[str, Any] | None:
    """
    Return the saved settings for a game, or ``None`` when absent.

    Args:
        game_id: Identifier of the game.

    Returns:
        Parsed settings dictionary, or ``None`` if nothing is stored yet.
    """
    with _connect() as conn:
        row = conn.execute(
            "SELECT settings FROM game_settings WHERE game_id = ?", (game_id,)
        ).fetchone()
    if row is None:
        return None
    try:
        return json.loads(row["settings"])
    except (json.JSONDecodeError, TypeError):
        return None


def save_game_settings(game_id: str, settings: dict[str, Any]) -> None:
    """
    Insert or replace the saved settings for a game.

    Args:
        game_id: Identifier of the game.
        settings: Serialised settings dictionary to persist.
    """
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO game_settings (game_id, settings, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(game_id) DO UPDATE SET
                settings = excluded.settings,
                updated_at = excluded.updated_at
            """,
            (game_id, json.dumps(settings), datetime.now().isoformat()),
        )


def list_custom_servers() -> list[dict[str, Any]]:
    """
    Return every user-saved custom realmlist, with its realms parsed.

    Returns:
        List of dictionaries with ``realmlist``, ``name`` and ``realms`` keys.
    """
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM custom_servers ORDER BY created_at ASC").fetchall()
    result: list[dict[str, Any]] = []
    for row in rows:
        try:
            realms = json.loads(row["realms"])
        except (json.JSONDecodeError, TypeError):
            realms = []
        result.append({"realmlist": row["realmlist"], "name": row["name"], "realms": realms})
    return result


def get_custom_server(realmlist: str) -> dict[str, Any] | None:
    """
    Return a single custom realmlist row, or ``None`` when not saved.

    Args:
        realmlist: Realmlist string to look up.

    Returns:
        Dictionary with ``realmlist``, ``name`` and ``realms``, or ``None``.
    """
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM custom_servers WHERE realmlist = ?", (realmlist,)
        ).fetchone()
    if row is None:
        return None
    try:
        realms = json.loads(row["realms"])
    except (json.JSONDecodeError, TypeError):
        realms = []
    return {"realmlist": row["realmlist"], "name": row["name"], "realms": realms}


def add_custom_server(realmlist: str, name: str, realms: list[str]) -> None:
    """
    Persist a brand-new custom realmlist globally.

    A no-op when the realmlist is already saved, so this is safe to call
    without checking existence first.

    Args:
        realmlist: The realmlist string the user typed.
        name: Display name for the entry (defaults to the realmlist itself).
        realms: Initial list of known realms for this realmlist.
    """
    with _connect() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO custom_servers (realmlist, name, realms, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (realmlist, name, json.dumps(realms), datetime.now().isoformat()),
        )


def add_realm_to_custom_server(realmlist: str, realm: str) -> None:
    """
    Append a new realm to an already-saved custom realmlist.

    A no-op when the realmlist isn't a saved custom entry, or when the realm
    is already known for it.

    Args:
        realmlist: The custom realmlist to update.
        realm: New realm name to add.
    """
    existing = get_custom_server(realmlist)
    if existing is None or realm in existing["realms"]:
        return
    realms = [*existing["realms"], realm]
    with _connect() as conn:
        conn.execute(
            "UPDATE custom_servers SET realms = ? WHERE realmlist = ?",
            (json.dumps(realms), realmlist),
        )
