"""
Application entry point.
"""

# Standard library
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

# Third-party
import webview
from dotenv import load_dotenv

APP_ROOT = Path(__file__).resolve().parent.parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))


load_dotenv(APP_ROOT / ".env")

# project imports
from desktop.config import config
from desktop.core.api import Api
from desktop.core import game_config
from desktop.core.events import emitter
from desktop.storage import db as db_store
from desktop.utils.logger import log, Tags


api = Api()

def _resolve_url() -> str:
    """
    Return the URL/path the webview should load.

    Resolution order:
      DEBUG=true  -> Vite dev server (the "demo" URL)
      dist exists -> built index.html (production)
      otherwise   -> fall back to the dev server instead of failing
    """
    build_path = APP_ROOT / config.build_dir / config.build_entry

    if config.debug:
        log("INFO", Tags.MAIN, f"Debug mode — dev server: {config.dev_url}")
        return config.dev_url

    if build_path.exists():
        log("INFO", Tags.MAIN, f"Production mode — {build_path}")
        return str(build_path)
    
    log(
        "WARNING",
        Tags.MAIN,
        f"Build not found at {build_path}; falling back to dev server {config.dev_url}",
    )
    return config.dev_url


def _scan_and_compare(game: "db_store.Game") -> dict | None:
    """
    Scan a game's client config and reconcile it with the saved settings.

    When the database has no settings yet, the scan result is stored as the
    initial copy.  When both exist and differ, the newer side is trusted
    automatically; only when the saved copy is newer do we surface a conflict
    to the user (who then decides which source of truth wins).

    Args:
        game: The game to reconcile.

    Returns:
        A conflict payload for the frontend, or ``None`` when there is nothing
        to ask about.
    """
    saved = db_store.get_game_settings(game.id)
    scanned = game_config.scan_game_config(game.exe_path)

    if saved is None:
        db_store.save_game_settings(game.id, scanned)
        return None

    if game_config.config_file_fingerprint(saved) == game_config.config_file_fingerprint(scanned):
        return None

    config_wtf = Path(game.exe_path).parent / "WTF" / "Config.wtf"
    game_mtime = config_wtf.stat().st_mtime if config_wtf.exists() else 0.0
    db_time = 0.0
    if saved.get("updated_at"):
        try:
            db_time = datetime.fromisoformat(saved["updated_at"]).timestamp()
        except ValueError:
            db_time = 0.0

    if db_time >= game_mtime:
        return {
            "game_id": game.id,
            "name": game.name,
            "expansion": game.expansion,
            "recommended": "db",
            "db_settings": saved,
            "game_settings": scanned,
        }

    db_store.save_game_settings(game.id, scanned)
    return None


def _boot_sequence() -> None:
    """
    Real boot sequence: scan every game and reconcile its saved configuration.

    Runs in a background thread so it doesn't block the webview loop.
    """
    # Give the frontend a moment to register the event handlers.
    time.sleep(0.5)

    emitter.boot_message("Inicializando núcleo…", 8)
    games = db_store.list_games()
    emitter.boot_message(f"Cargando {len(games)} juego(s)…", 22)

    conflicts: list[dict] = []
    total = max(1, len(games))
    for index, game in enumerate(games):
        emitter.boot_message(f"Escaneando configuración de {game.name}…", 30 + int(55 * (index + 1) / total))
        try:
            conflict = _scan_and_compare(game)
            if conflict is not None:
                conflicts.append(conflict)
        except OSError as exc:
            log("ERROR", Tags.SETTINGS, f"scan fallido para {game.name}: {exc}")

    emitter.boot_message("Finalizando…", 92)
    for conflict in conflicts:
        emitter.emit("config_conflict", conflict)

    emitter.boot_done()


def _on_loaded(window: "webview.Window") -> None:
    """Called by pywebview once the page finishes loading."""
    log("SUCCESS", Tags.WINDOW, "Page loaded — starting boot sequence")
    emitter.attach(window)
    api.attach_window(window)
    thread = threading.Thread(target=_boot_sequence, daemon=True)
    thread.start()


def main() -> None:
    """Bootstrap and start the pywebview application."""
    log("INFO", Tags.MAIN, f"Starting {config.app_name}")

    db_store.init_db()

    webview.settings["DRAG_REGION_DIRECT_TARGET_ONLY"] = True

    url = _resolve_url()

    window = webview.create_window(
        title=config.app_name,
        url=url,
        js_api=api,
        width=config.width,
        height=config.height,
        resizable=config.resizable,
        frameless=config.frameless,
        easy_drag=config.easy_drag,
        background_color=config.background_color,
    )

    window.events.loaded += lambda: _on_loaded(window)

    log("SUCCESS", Tags.MAIN, "Window created — starting webview loop")
    webview.start(debug=config.debug)
    log("INFO", Tags.MAIN, "Webview loop exited — bye!")


if __name__ == "__main__":
    main()