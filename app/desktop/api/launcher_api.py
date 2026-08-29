"""Launch business logic for saved World of Warcraft installations."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from desktop.models.game import Game
from desktop.utils.logger import log, Tags


def launch_wow(game: Game) -> dict:
    """
    Start the WoW client process for a saved game.

    Args:
        game: The game whose ``exe_path`` should be launched.

    Returns:
        Success envelope; ``error`` carries a human-readable reason on failure.
    """
    exe: Path = Path(game.exe_path)
    if not exe.exists():
        log("ERROR", Tags.API, f"Executable not found for {game.name}: {exe}")
        return {"ok": False, "error": f"Executable not found: {exe}"}

    try:
        subprocess.Popen(
            [str(exe)],
            cwd=str(exe.parent),
            creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == "win32" else 0,
        )
    except OSError as exc:
        log("ERROR", Tags.API, f"Failed to launch {game.name}: {exc}")
        return {"ok": False, "error": str(exc)}

    log("INFO", Tags.API, f"Launched {game.name} -> {exe}")
    return {"ok": True, "error": None}
