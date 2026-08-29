"""
Application settings persistence (JSON file).

Per-game data lives in the SQLite database; this module only handles the
small global ``config.json`` file.
"""

from __future__ import annotations

import json
from typing import Any

from desktop.models.settings import AppSettings
from desktop.utils.paths import config_path


def load_app_config() -> AppSettings:
    """
    Load application settings, returning defaults if the file is absent.

    Returns:
        ``AppSettings`` instance (defaults applied when missing/corrupt).
    """
    path = config_path()
    if not path.exists():
        return AppSettings()
    try:
        with path.open("r", encoding="utf-8") as handle:
            data: dict[str, Any] = json.load(handle)
    except (json.JSONDecodeError, OSError):
        return AppSettings()
    return AppSettings.from_dict(data)


def save_app_config(settings: AppSettings) -> None:
    """
    Persist application settings to ``config.json``.

    Args:
        settings: The ``AppSettings`` instance to serialise.
    """
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(settings.to_dict(), handle, indent=2, ensure_ascii=False)
