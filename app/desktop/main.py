"""
Application entry point.
"""

# Standard library
import sys
import threading
import time
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


def _boot_sequence() -> None:
    """
    Example boot sequence — replace with real initialisation logic.
    Runs in a background thread so it doesn't block the webview loop.
    """
    # Give the frontend a moment to register the event handlers.
    time.sleep(0.5)

    steps = [
        ("Initializing core…",        10),
        ("Loading configuration…",    25),
        ("Checking client files…",    45),
        ("Connecting to database…",   65),
        ("Starting Discord RPC…",     80),
        ("Almost ready…",             95),
    ]

    for message, percent in steps:
        emitter.boot_message(message, percent)
        time.sleep(3)

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