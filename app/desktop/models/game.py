"""
Game domain model and the bundled-asset catalogue.

A ``Game`` is a user-added World of Warcraft installation. The bundled
``EXPANSIONS`` dictionary provides sensible default media for each expansion,
and :func:`scan_assets` discovers every selectable media file shipped with the
app so the UI can offer alternatives.
"""

from __future__ import annotations

import shutil
import uuid
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

from desktop.utils.paths import custom_assets_kind_dir, public_assets_dir


EXPANSIONS: dict[str, dict[str, str]] = {
    "classic": {
        "name": "World of Warcraft Classic",
        "video": "/assets/games/scenes/classic/wow_classic_portal.mp4",
        "poster": "/assets/games/logos/classic/WoClassic.png",
        "icon": "/assets/games/icos/classic/ico/wow_classic.ico",
    },
    "tbc": {
        "name": "The Burning Crusade",
        "video": "/assets/games/scenes/burning/wow_bc_dark_portal.mp4",
        "poster": "/assets/games/logos/burning/WoBurningCrusade.png",
        "icon": "/assets/games/icos/burning/ico/wow_bc.ico",
    },
    "wotlk": {
        "name": "Wrath of the Lich King",
        "video": "/assets/games/scenes/wotlk/wow_lich_king_sword.mp4",
        "poster": "/assets/games/logos/wotlk/WoWtlk.png",
        "icon": "/assets/games/icos/wotlk/png/wtlk_alter.png",
    },
}

DEFAULT_ICON_KIND: str = "icos"
DEFAULT_LOGO_KIND: str = "logos"
DEFAULT_SCENE_KIND: str = "scenes"


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
    show_on_main: bool = False
    created_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Serialise the game to a JSON-friendly dictionary."""
        return asdict(self)

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "Game":
        """Build a ``Game`` from a SQLite row mapping."""
        return cls(
            id=row["id"],
            name=row["name"],
            expansion=row["expansion"],
            exe_path=row["exe_path"],
            bg_video=row["bg_video"],
            icon=row["icon"],
            poster=row["poster"],
            show_on_main=bool(row["show_on_main"]),
            created_at=row.get("created_at", ""),
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
        return cls(
            id=payload.get("id") or str(uuid.uuid4()),
            name=payload.get("name", ""),
            expansion=payload.get("expansion", "wotlk"),
            exe_path=payload.get("exe_path", ""),
            bg_video=payload.get("bg_video", ""),
            icon=payload.get("icon", ""),
            poster=payload.get("poster", ""),
            show_on_main=bool(payload.get("show_on_main", False)),
            created_at=payload.get("created_at", ""),
        )


def scan_assets() -> dict[str, Any]:
    """
    Discover every selectable media file shipped with the application.

    Returns:
        Dictionary with ``expansions``, ``available_videos``,
        ``available_posters`` and ``available_icons`` keys.
    """
    root: Path = public_assets_dir()

    def _collect(kind: str, ext: str) -> list[str]:
        folder = root / kind
        if not folder.exists():
            return []
        return sorted(
            f"/assets/games/{kind}/{p.relative_to(folder).as_posix()}"
            for p in folder.rglob(f"*.{ext}")
        )

    return {
        "expansions": EXPANSIONS,
        "available_videos": _collect("scenes", "mp4"),
        "available_posters": _collect("logos", "png"),
        "available_icons": _collect("icos", "ico") + _collect("icos", "png"),
    }


def copy_custom_asset(kind: str, src_path: str) -> str:
    """
    Copy a user-selected asset into the app-data custom folder.

    Args:
        kind: One of ``icos``, ``logos`` or ``scenes``.
        src_path: Absolute path of the file the user picked.

    Returns:
        Absolute destination path of the copied file (served as a ``file://``
        URL by the frontend).
    """
    src: Path = Path(src_path)
    dest_dir: Path = custom_assets_kind_dir(kind)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest: Path = dest_dir / src.name
    shutil.copy2(src, dest)
    return str(dest)
