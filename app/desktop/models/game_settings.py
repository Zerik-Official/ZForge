"""
Per-game launcher configuration model.

Holds every setting the launcher can manage for a single World of Warcraft
installation: launch behaviour, realm/server overrides and graphics options.
The data round-trips to JSON in the database and to the game's ``Config.wtf``
/ ``realmlist.wtf`` files.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any


@dataclass
class GameSettings:
    """All tunable settings for one saved game."""

    # ── Launch ─────────────────────────────────────────────────────────────
    launch_args: str = ""
    launch_priority: str = "normal"
    clear_cache_on_launch: bool = False

    # ── Server ────────────────────────────────────────────────────────────
    realm_list: str = ""
    realm_name: str = ""

    # ── Graphics ──────────────────────────────────────────────────────────
    refresh_rate: int = 60
    resolution: str = "1920x1080"
    windowed: bool = False
    window_resize_lock: bool = False
    window_maximized: bool = False
    vsync: bool = True
    multisample: int = 1

    def to_dict(self) -> dict[str, Any]:
        """Serialise the settings to a JSON-friendly dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "GameSettings":
        """Build a ``GameSettings`` from a dictionary, ignoring unknown keys."""
        known = {field for field in cls.__dataclass_fields__}
        return cls(**{key: value for key, value in data.items() if key in known})

    @classmethod
    def defaults(cls) -> "GameSettings":
        """Return a fresh instance with the built-in default values."""
        from desktop.utils import display

        width, height = display.get_primary_resolution()
        return cls(resolution=f"{width}x{height}")
