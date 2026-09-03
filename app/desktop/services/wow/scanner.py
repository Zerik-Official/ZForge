"""
WoW installation scanner.

Discovers bundled assets shipped with the application so the UI can
offer alternatives when adding a game.
"""

# Standard library
from __future__ import annotations

from pathlib import Path
from typing import Any

# Project imports
from desktop.constants import EXPANSIONS
from desktop.utils.paths import public_assets_dir


def scan_assets() -> dict[str, Any]:
    """
    Discover every selectable media file shipped with the application.

    Returns:
        Dictionary with ``expansions``, ``available_videos``,
        ``available_posters``, ``available_icons`` and ``available_boxes`` keys.
    """
    root: Path = public_assets_dir()

    def _collect(kind: str, ext: str) -> list[str]:
        folder: Path = root / kind
        if not folder.exists():
            return []
        return sorted(
            f"/assets/games/{kind}/{p.relative_to(folder).as_posix()}"
            for p in folder.rglob(f"*.{ext}")
        )

    return {
        "expansions": EXPANSIONS,
        "available_videos": _collect("scenes", "mp4"),
        "available_posters": _collect("logos", "png") + _collect("logos", "webp"),
        "available_icons": _collect("icos", "ico") + _collect("icos", "png"),
        "available_boxes": _collect("boxes", "png"),
    }