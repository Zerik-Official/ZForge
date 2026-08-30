"""
Per-game configuration: scan the installed client and apply saved settings.

The launcher keeps its own copy of every game's settings in the database.  On
boot we compare that copy against what the game files actually contain; when
they diverge we let the user decide which side wins.  These helpers bridge the
:class:`GameSettings` model and the game's ``Config.wtf`` / ``realmlist.wtf``.
"""

# Standard library
from __future__ import annotations

from pathlib import Path
from typing import Any

# Project imports
from desktop.models.game_settings import GameSettings
from desktop.services.config import wtf
from desktop.utils import display
from desktop.utils.logger import log, Tags


def scan_game_config(exe_path: str) -> dict[str, Any]:
    """
    Read the current client configuration from disk into a settings dict.

    Only the fields backed by game files (server + graphics) are populated;
    pure launcher options keep their defaults.

    Args:
        exe_path: Absolute path of the game executable.

    Returns:
        Serialised :class:`GameSettings` dictionary.
    """
    root = Path(exe_path).parent
    config_path = root / "WTF" / "Config.wtf"
    parsed = wtf.parse_config_wtf(config_path)

    def read(key: str, default: str) -> str:
        return wtf.get_config_value(parsed, key, default)

    def to_int(key: str, default: int) -> int:
        raw = read(key, str(default))
        try:
            return int(raw)
        except ValueError:
            return default

    max_w, max_h = display.get_primary_resolution()

    settings = GameSettings(
        realm_list=read("realmList", ""),
        realm_name=read("realmName", ""),
        refresh_rate=to_int("gxRefresh", 60),
        resolution=read("gxResolution", f"{max_w}x{max_h}"),
        windowed=read("gxWindow", "0") == "1",
        window_resize_lock=read("windowResizeLock", "0") == "1",
        window_maximized=read("gxMaximize", "0") == "1",
        vsync=read("gxVSync", "1") != "0",
        multisample=to_int("gxMultisample", 1),
    )
    log("DEBUG", Tags.SETTINGS, f"Scanned config for {exe_path}")
    return settings.to_dict()


def apply_game_settings(settings: dict[str, Any], exe_path: str) -> None:
    """
    Push saved settings into the game's ``Config.wtf`` and ``realmlist.wtf``.

    Args:
        settings: Serialised :class:`GameSettings` dictionary.
        exe_path: Absolute path of the game executable.
    """
    root = Path(exe_path).parent
    config_path = root / "WTF" / "Config.wtf"

    windowed = bool(settings.get("windowed", False))
    vsync = bool(settings.get("vsync", True))
    multisample = int(settings.get("multisample", 1))

    config_updates: dict[str, str | None] = {
        "realmList": settings.get("realm_list") or None,
        "realmName": settings.get("realm_name") or None,
        "gxRefresh": str(settings.get("refresh_rate", 60)),
        "gxResolution": settings.get("resolution", "1920x1080"),
        "gxWindow": "1" if windowed else None,
        "windowResizeLock": "1" if settings.get("window_resize_lock", False) else None,
        "gxMaximize": "1" if settings.get("window_maximized", False) else None,
        "gxVSync": "0" if not vsync else None,
        "gxMultisample": str(multisample) if multisample != 1 else None,
    }
    wtf.write_config_wtf(config_path, config_updates)

    realm_list = settings.get("realm_list", "")
    if realm_list:
        data_dir = root / "Data"
        if data_dir.exists():
            for lang_dir in sorted(data_dir.iterdir()):
                if lang_dir.is_dir():
                    wtf.set_realmlist_value(lang_dir / "realmlist.wtf", realm_list)

    log("INFO", Tags.SETTINGS, f"Applied settings to game at {exe_path}")


def config_file_fingerprint(settings: dict[str, Any]) -> dict[str, Any]:
    """
    Extract only the fields that are reflected in game files.

    Used to compare the database copy against a fresh scan without being thrown
    off by launcher-only options (launch args, priority, cache clearing).

    Args:
        settings: Serialised :class:`GameSettings` dictionary.

    Returns:
        Subset dictionary containing the comparable keys.
    """
    keys = [
        "realm_list",
        "realm_name",
        "refresh_rate",
        "resolution",
        "windowed",
        "window_resize_lock",
        "window_maximized",
        "vsync",
        "multisample",
    ]
    return {key: settings.get(key) for key in keys}
