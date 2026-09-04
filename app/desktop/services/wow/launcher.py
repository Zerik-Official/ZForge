"""
WoW process launcher.

Handles per-game launch behaviour: extra arguments, process priority
and optional cache wipe before starting the client.
"""

# Standard library
from __future__ import annotations

import shlex
import shutil
import subprocess
import sys
from pathlib import Path

# Project imports
from desktop.core.errors import ErrorCode, make_error_string_envelope
from desktop.models.game import Game
from desktop.storage import db as db_store
from desktop.utils.logger import Tags, log


def _resolve_priority_token(priority: str) -> str | None:
    """
    Map a saved priority name to a ``START`` priority token.

    Args:
        priority: One of ``normal``, ``high`` or ``realtime``.

    Returns:
        The ``START`` token (e.g. ``high``) or ``None`` for the default path.
    """
    token = {"high": "high", "realtime": "realtime", "abovenormal": "abovenormal"}.get(priority.lower())
    return token


def launch_wow(game: Game) -> dict[str, object]:
    """
    Start the WoW client process for a saved game.

    The launch honours the per-game settings: extra command-line arguments,
    an optional high/realtime priority and an optional cache wipe performed
    before the process starts.

    Args:
        game: The game whose ``exe_path`` should be launched.

    Returns:
        Success envelope; ``error`` carries a human-readable reason on failure.
    """
    exe: Path = Path(game.exe_path)
    if not exe.exists():
        log("ERROR", Tags.API, f"Executable not found for {game.name}: {exe}")
        return make_error_string_envelope(
            ErrorCode.EXECUTABLE_NOT_FOUND, {"path": str(exe)}
        )

    settings: dict[str, object] = db_store.get_game_settings(game.id) or {}
    extra_args: list[str] = shlex.split(str(settings.get("launch_args", "") or ""))
    priority: str = str(settings.get("launch_priority", "normal"))

    if settings.get("clear_cache_on_launch", False):
        cache_dir: Path = exe.parent / "Cache"
        if cache_dir.exists():
            shutil.rmtree(cache_dir, ignore_errors=True)
            log("INFO", Tags.LAUNCHER, f"Cleared cache for {game.name}")

    creationflags: int = subprocess.CREATE_NEW_CONSOLE if sys.platform == "win32" else 0

    try:
        token: str | None = _resolve_priority_token(priority)
        if token is None:
            subprocess.Popen([str(exe), *extra_args], cwd=str(exe.parent), creationflags=creationflags)
        else:
            command: str = f'cmd /c start /{token} "" "{exe}"'
            if extra_args:
                command += " " + " ".join(extra_args)
            subprocess.Popen(command, cwd=str(exe.parent), shell=True, creationflags=creationflags)
    except OSError as exc:
        log("ERROR", Tags.API, f"Failed to launch {game.name}: {exc}")
        return {"ok": False, "error": str(exc)}

    log("INFO", Tags.API, f"Launched {game.name} -> {exe}")
    return {"ok": True, "error": None}