"""
Global and per-game settings API.

Thin API layer that validates input and delegates to storage and
services. Called by the pywebview bridge in core/api.py.
"""

# Standard library
from __future__ import annotations

# Project imports
from desktop.core import game_config
from desktop.core import settings_schema as schema_service
from desktop.models import server as server_catalog
from desktop.storage import config as config_store
from desktop.storage import db as db_store
from desktop.utils import display
from desktop.utils.logger import log, Tags
from desktop.utils import audio as audio_utils
from desktop.constants import SUPPORTED_LANGUAGES

def get_settings() -> dict[str, object]:
    """Return the current application settings."""
    log("DEBUG", Tags.API, "get_settings() called")
    return config_store.load_app_config().to_dict()


def _apply_app_config_patch(current: object, payload: dict[str, object]) -> None:
    """
    Apply a partial payload to the given ``AppSettings`` instance.

    Validates ``language`` when present and ignores unknown keys.

    Args:
        current: ``AppSettings`` instance to mutate.
        payload: Dictionary received from the frontend.
    """
    if "theme" in payload:
        current.theme = payload.get("theme", current.theme)  # type: ignore[assignment]
    if "last_active_game" in payload:
        current.last_active_game = payload.get("last_active_game", current.last_active_game)  # type: ignore[assignment]
    if "language" in payload:
        raw = payload.get("language")
        if raw is None:
            current.language = None  # type: ignore[assignment]
        elif isinstance(raw, str) and raw in SUPPORTED_LANGUAGES:
            current.language = raw  # type: ignore[assignment]
        else:
            log("WARNING", Tags.API, f"save_app_config: unsupported language '{raw}' — ignored")
    if "discord_enabled" in payload:
        current.discord_enabled = bool(payload.get("discord_enabled"))  # type: ignore[assignment]
    if "discord_auto_update" in payload:
        current.discord_auto_update = bool(payload.get("discord_auto_update"))  # type: ignore[assignment]
    if "sdk_last_error" in payload:
        raw_err = payload.get("sdk_last_error")
        current.sdk_last_error = str(raw_err) if isinstance(raw_err, str) and raw_err.strip() else None  # type: ignore[assignment]


def save_settings(payload: dict[str, object]) -> dict[str, object]:
    """Persist updated settings."""
    log("DEBUG", Tags.API, f"save_settings() called — keys: {list(payload.keys())}")
    current = config_store.load_app_config()
    _apply_app_config_patch(current, payload)
    config_store.save_app_config(current)
    return {"ok": True, "error": None}


def get_app_config() -> dict[str, object]:
    """Return the global application settings."""
    return config_store.load_app_config().to_dict()


def save_app_config(payload: dict[str, object]) -> dict[str, object]:
    """Persist global application settings."""
    current = config_store.load_app_config()
    _apply_app_config_patch(current, payload)
    config_store.save_app_config(current)
    return {"ok": True, "error": None}


def get_display_resolution() -> dict[str, int]:
    """Return the primary monitor's native resolution."""
    width, height = display.get_primary_resolution()
    log("DEBUG", Tags.API, f"get_display_resolution() -> {width}x{height}")
    return {"width": width, "height": height}


def get_game_settings(game_id: str) -> dict[str, object]:
    """Return the saved launcher settings for a game."""
    log("DEBUG", Tags.API, f"get_game_settings() -> {game_id}")
    settings = db_store.get_game_settings(game_id)
    return settings if settings is not None else {}


def save_game_settings(game_id: str, payload: dict[str, object]) -> dict[str, object]:
    """Persist edited launcher settings for a game."""
    log("DEBUG", Tags.API, f"save_game_settings() -> {game_id}")
    db_store.save_game_settings(game_id, payload)
    return {"ok": True, "error": None}


def scan_game_config(game_id: str) -> dict[str, object]:
    """Scan a game's client files and return the detected settings."""
    log("DEBUG", Tags.API, f"scan_game_config() -> {game_id}")
    game = db_store.get_game(game_id)
    if game is None:
        return {"ok": False, "error": "Game not found"}
    return game_config.scan_game_config(game.exe_path)


def apply_game_settings(game_id: str) -> dict[str, object]:
    """Write the saved settings into the game's configuration files."""
    log("DEBUG", Tags.API, f"apply_game_settings() -> {game_id}")
    game = db_store.get_game(game_id)
    if game is None:
        return {"ok": False, "error": "Game not found"}
    settings = db_store.get_game_settings(game_id)
    if settings is None:
        return {"ok": False, "error": "No saved settings for this game"}
    try:
        game_config.apply_game_settings(settings, game.exe_path)
    except OSError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "error": None}


def pull_game_settings(game_id: str) -> dict[str, object]:
    """Overwrite the saved settings with what the game files currently hold."""
    log("DEBUG", Tags.API, f"pull_game_settings() -> {game_id}")
    game = db_store.get_game(game_id)
    if game is None:
        return {"ok": False, "error": "Game not found"}
    try:
        db_store.save_game_settings(game_id, game_config.scan_game_config(game.exe_path))
    except OSError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "error": None}


def list_servers() -> list[dict[str, object]]:
    """Return the combined bundled + user-saved custom server catalogue."""
    return server_catalog.list_servers()


def save_custom_server(payload: dict[str, object]) -> dict[str, object]:
    """Persist a brand-new custom realmlist globally."""
    realmlist = str(payload.get("realmlist") or "").strip()
    if not realmlist:
        return {"ok": False, "error": "Realmlist vacío"}
    name = str(payload.get("name") or realmlist).strip()
    realm = str(payload.get("realm") or "").strip()
    db_store.add_custom_server(realmlist, name, [realm] if realm else [])
    log("INFO", Tags.API, f"save_custom_server() -> {realmlist}")
    return {"ok": True, "error": None}


def add_custom_realm(realmlist: str, realm: str) -> dict[str, object]:
    """Append a new realm to an already-saved custom realmlist."""
    realm = (realm or "").strip()
    if not realm:
        return {"ok": True, "error": None}
    db_store.add_realm_to_custom_server((realmlist or "").strip(), realm)
    log("INFO", Tags.API, f"add_custom_realm() -> {realmlist} / {realm}")
    return {"ok": True, "error": None}


def get_settings_schema(version_id: str) -> dict[str, object]:
    """
    Return the settings schema for a given game version.

    Args:
        version_id: Schema identifier like ``wow-wotlk-335a``.

    Returns:
        Schema dictionary or error envelope when not found.
    """
    log("DEBUG", Tags.API, f"get_settings_schema() -> {version_id}")
    schema = schema_service.load_schema(version_id)
    if schema is None:
        return {"ok": False, "error": f"Schema not found for {version_id}"}
    return schema


def list_settings_versions() -> list[str]:
    """Return all available settings schema version ids."""
    return schema_service.list_available_versions()


def list_audio_devices() -> list[dict[str, object]]:
    """Return available audio output devices for the dropdown."""
    return audio_utils.list_output_devices()