"""
Filesystem path resolution for the desktop host.

All user data lives under the OS application-data directory so it survives
updates of the launcher itself:

    %APPDATA%/ZForge/
        config/config.json        -> application settings
        database/database.db       -> games + per-game data (SQLite)
        assets/custom/             -> user-provided icons / logos / scenes
"""

from __future__ import annotations

import os
from pathlib import Path


def app_name() -> str:
    """Return the application name used for the app-data folder."""
    return "ZForge"


def app_data_dir() -> Path:
    """Return the root directory for all persisted user data."""
    base: str = os.environ.get("APPDATA") or os.path.expanduser("~/.local/share")
    return Path(base) / app_name()


def config_dir() -> Path:
    """Return the directory holding ``config.json``."""
    return app_data_dir() / "config"


def config_path() -> Path:
    """Return the absolute path of the application settings file."""
    return config_dir() / "config.json"


def database_dir() -> Path:
    """Return the directory holding the SQLite database."""
    return app_data_dir() / "database"


def db_path() -> Path:
    """Return the absolute path of the SQLite database file."""
    return database_dir() / "database.db"


def custom_assets_dir() -> Path:
    """Return the root directory for user-provided (custom) assets."""
    return app_data_dir() / "assets" / "custom"


def custom_assets_kind_dir(kind: str) -> Path:
    """
    Return the directory for a specific custom-asset kind.

    Args:
        kind: One of ``icos``, ``logos`` or ``scenes``.

    Returns:
        Absolute directory path for that asset kind.
    """
    return custom_assets_dir() / kind


def public_assets_dir() -> Path:
    """
    Return the directory of the bundled (default) game assets.

    These ship with the build under ``app/public/assets/games`` and are
    referenced by URL from the frontend, not copied.
    """
    return Path(__file__).resolve().parents[2] / "public" / "assets" / "games"


def servers_data_path() -> Path:
    """
    Return the bundled, read-only server/realmlist catalogue JSON path.

    Ships with the build under ``app/desktop/data/servers/servers.json``.
    """
    return Path(__file__).resolve().parents[1] / "data" / "servers" / "servers.json"


def tools_dir() -> Path:
    """Return the directory holding external tools (e.g. WoWControlSDK)."""
    return app_data_dir() / "tools"


def sdk_installations_dir() -> Path:
    """Return the parent directory that contains ``WoWControlSDK-v*`` folders."""
    return tools_dir()