"""
Game domain model and the bundled-asset catalogue.

The bundled ``EXPANSIONS`` dictionary provides sensible default media for
each expansion.
"""

# Standard library
from __future__ import annotations

import uuid
from dataclasses import dataclass, asdict
from typing import Any

# Project imports
from desktop.constants import EXPANSIONS


@dataclass
class Game:
    """A user-added World of Warcraft installation."""

    id: str
    name: str
    expansion: str
    exe_path: str
    bg_video: str
    icon: str
    poster: str
    box: str = ""
    show_on_main: bool = False
    created_at: str = ""
    sort_order: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Serialise the game to a JSON-friendly dictionary."""
        return asdict(self)

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "Game":
        """Build a ``Game`` from a SQLite row mapping."""
        box = row.get("box", "") or row.get("poster", "") or ""
        if box and "/logos/" in box:
            box = EXPANSIONS.get(row.get("expansion", ""), {}).get("box", box)
        return cls(
            id=row["id"],
            name=row["name"],
            expansion=row["expansion"],
            exe_path=row["exe_path"],
            bg_video=row["bg_video"],
            icon=row["icon"],
            poster=row["poster"],
            box=box,
            show_on_main=bool(row["show_on_main"]),
            created_at=row.get("created_at", ""),
            sort_order=int(row.get("sort_order", 0) or 0),
        )

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "Game":
        """
        Build a ``Game`` from a frontend payload.

        A fresh id and ``created_at`` timestamp are generated here; the
        frontend is not trusted with identity or auditing fields.

        Args:
            payload: Dictionary coming from the add/edit modal.

        Returns:
            Fully-populated ``Game`` instance.
        """
        box = payload.get("box") or EXPANSIONS.get(payload.get("expansion", "wotlk"), {}).get("box", "")
        return cls(
            id=payload.get("id") or str(uuid.uuid4()),
            name=payload.get("name", ""),
            expansion=payload.get("expansion", "wotlk"),
            exe_path=payload.get("exe_path", ""),
            bg_video=payload.get("bg_video", ""),
            icon=payload.get("icon", ""),
            poster=payload.get("poster", ""),
            box=box,
            show_on_main=bool(payload.get("show_on_main", False)),
            created_at=payload.get("created_at", ""),
            sort_order=int(payload.get("sort_order", 0) or 0),
        )
