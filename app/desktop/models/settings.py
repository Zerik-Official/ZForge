"""
Application-level settings model.

These are global preferences (not per-game) persisted to ``config.json``.
"""

# Standard library
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Literal

# Project imports
from desktop.constants import SUPPORTED_LANGUAGES


AppLanguage = Literal["en", "es"]

@dataclass
class AppSettings:
    """Global launcher preferences stored in the app-data config file."""

    theme: str = "dark"
    last_active_game: str | None = None
    language: AppLanguage | None = None
    discord_enabled: bool = False
    discord_auto_update: bool = True
    sdk_last_error: str | None = None
    sdk_ever_installed: bool = False

    def to_dict(self) -> dict[str, Any]:
        """Serialise the settings to a JSON-friendly dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "AppSettings":
        """
        Build settings from a dictionary, ignoring unknown keys.

        Args:
            data: Dictionary loaded from ``config.json``.

        Returns:
            ``AppSettings`` with defaults applied for missing fields.
        """
        raw_lang = data.get("language")
        language: AppLanguage | None = None
        if isinstance(raw_lang, str) and raw_lang in SUPPORTED_LANGUAGES:
            language = raw_lang  # type: ignore[assignment]

        return cls(
            theme=data.get("theme", "dark"),
            last_active_game=data.get("last_active_game"),
            language=language,
            discord_enabled=bool(data.get("discord_enabled", False)),
            discord_auto_update=bool(data.get("discord_auto_update", True)),
            sdk_last_error=data.get("sdk_last_error"),
            sdk_ever_installed=bool(data.get("sdk_ever_installed", False)),
        )