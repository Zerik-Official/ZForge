"""
Application-level settings model.

These are global preferences (not per-game) persisted to ``config.json``.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Literal


AppLanguage = Literal["en", "es"]
SUPPORTED_LANGUAGES: set[str] = {"en", "es"}


@dataclass
class AppSettings:
    """Global launcher preferences stored in the app-data config file."""

    theme: str = "dark"
    last_active_game: str | None = None
    language: AppLanguage | None = None

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
        )
