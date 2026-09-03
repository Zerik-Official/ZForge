"""
Background task scheduler.

Runs the boot-time reconciliation of saved game settings.
"""

# Standard library
from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path

# Project imports
from desktop.core import game_config
from desktop.core.events import emitter
from desktop.services.sdk import manager as sdk_manager
from desktop.storage import db as db_store
from desktop.utils.logger import log, Tags

import threading

_boot_lock = threading.Lock()
_boot_has_run = False


def _scan_and_compare(game: object) -> dict[str, object] | None:
    """
    Scan a game's client config and reconcile it with the saved settings.

    When the database has no settings yet, the scan result is stored as the
    initial copy. When both exist and differ, the newer side is trusted
    automatically; only when the saved copy is newer do we surface a conflict
    to the user.

    Args:
        game: The game to reconcile.

    Returns:
        A conflict payload for the frontend, or ``None`` when there is nothing
        to ask about.
    """
    saved: dict[str, object] | None = db_store.get_game_settings(game.id)  # type: ignore[attr-defined]
    scanned: dict[str, object] = game_config.scan_game_config(game.exe_path)  # type: ignore[attr-defined]

    if saved is None:
        db_store.save_game_settings(game.id, scanned)  # type: ignore[attr-defined]
        return None

    if game_config.config_file_fingerprint(saved) == game_config.config_file_fingerprint(scanned):
        return None

    config_wtf: Path = Path(game.exe_path).parent / "WTF" / "Config.wtf"  # type: ignore[attr-defined]
    game_mtime: float = config_wtf.stat().st_mtime if config_wtf.exists() else 0.0
    db_time: float = 0.0
    updated_at = saved.get("updated_at") if isinstance(saved, dict) else None
    if isinstance(updated_at, str) and updated_at:
        try:
            db_time = datetime.fromisoformat(updated_at).timestamp()
        except ValueError:
            db_time = 0.0

    if db_time >= game_mtime:
        return {
            "game_id": game.id,  # type: ignore[attr-defined]
            "name": game.name,  # type: ignore[attr-defined]
            "expansion": game.expansion,  # type: ignore[attr-defined]
            "recommended": "db",
            "db_settings": saved,
            "game_settings": scanned,
        }

    db_store.save_game_settings(game.id, scanned)  # type: ignore[attr-defined]
    return None


def boot_sequence() -> None:
    """
    Real boot sequence: scan every game and reconcile its saved configuration.

    Runs in a background thread so it doesn't block the webview loop.
    Guarded against double invocation caused by duplicate ``loaded`` events.
    """
    global _boot_has_run
    with _boot_lock:
        if _boot_has_run:
            log("WARNING", Tags.API, "boot_sequence already running — ignoring duplicate call")
            return
        _boot_has_run = True

    time.sleep(0.5)

    emitter.boot_message("Inicializando núcleo…", 8)

    try:
        emitter.boot_message("Verificando SDK…", 12)
        sdk_manager.check_and_repair_on_boot()
    except Exception as exc:
        log("WARNING", Tags.API, f"SDK boot check failed: {exc}")

    games = db_store.list_games()
    emitter.boot_message(f"Cargando {len(games)} juego(s)…", 22)

    conflicts: list[dict[str, object]] = []
    total: int = max(1, len(games))
    for index, game in enumerate(games):
        emitter.boot_message(
            f"Escaneando configuración de {game.name}…", 30 + int(55 * (index + 1) / total)  # type: ignore[attr-defined]
        )
        try:
            conflict = _scan_and_compare(game)
            if conflict is not None:
                conflicts.append(conflict)
        except OSError as exc:
            log("ERROR", Tags.SETTINGS, f"scan fallido para {game.name}: {exc}")  # type: ignore[attr-defined]

    emitter.boot_message("Finalizando…", 92)
    for conflict in conflicts:
        emitter.emit("config_conflict", conflict)

    emitter.boot_done()