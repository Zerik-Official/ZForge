"""
Central constants for expansions, paths and defaults.
"""

# Standard library
from __future__ import annotations
from typing import Final

EXPANSIONS: dict[str, dict[str, str]] = {
    "classic": {
        "name": "World of Warcraft Classic",
        "video": "/assets/games/scenes/classic/wow_classic_portal.mp4",
        "poster": "/assets/games/logos/classic/wow_classic_blue.webp",
        "icon": "/assets/games/icos/classic/ico/wow_classic.ico",
        "box": "/assets/games/boxes/wow_box_classic.png",
    },
    "tbc": {
        "name": "The Burning Crusade",
        "video": "/assets/games/scenes/burning/wow_bc_dark_portal.mp4",
        "poster": "/assets/games/logos/burning/wow_burning_crusade.webp",
        "icon": "/assets/games/icos/burning/ico/wow_bc.ico",
        "box": "/assets/games/boxes/wow_tbc_box.png",
    },
    "wotlk": {
        "name": "Wrath of the Lich King",
        "video": "/assets/games/scenes/wotlk/wow_lich_king_sword.mp4",
        "poster": "/assets/games/logos/wotlk/wow_wotlk.webp",
        "icon": "/assets/games/icos/wotlk/png/wtlk_alter.png",
        "box": "/assets/games/boxes/wow_wotlk_box.png",
    },
}

DEFAULT_ICON_KIND: Final[str] = "icos"
DEFAULT_LOGO_KIND: Final[str] = "logos"
DEFAULT_BOX_KIND: Final[str] = "boxes"
DEFAULT_SCENE_KIND: Final[str] = "scenes"

SUPPORTED_LANGUAGES: frozenset[str] = {"en", "es"}