"""
Application entry point.
"""

# Standard library
import sys
import threading
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Ensure project root is on sys.path when running directly:
#   python backend/main.py
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# ---------------------------------------------------------------------------
# Load .env before anything else reads os.environ
# ---------------------------------------------------------------------------
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

import webview

# project imports
from backend.config import config
from backend.core.api import Api
from backend.core.events import emitter
from backend.utils.logger import log, Tags


def _resolve_url() -> str:
    """
    Return the URL/path the webview should load.
    DEBUG=true  -> Vite dev server (localhost:5173)
    DEBUG=false -> dist/index.html
    """
    if config.debug:
        log("INFO", Tags.WINDOW, f"Debug mode — dev server: {config.dev_url}")
        return config.dev_url

    build_path = ROOT / config.build_dir / config.build_entry
    if not build_path.exists():
        log("ERROR", Tags.WINDOW, f"Build not found at {build_path}. Run `npm run build` first.")
        sys.exit(1)

    log("INFO", Tags.WINDOW, f"Production mode — {build_path}")
    return str(build_path)


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
    thread = threading.Thread(target=_boot_sequence, daemon=True)
    thread.start()


def main() -> None:
    """Bootstrap and start the pywebview application."""
    log("INFO", Tags.MAIN, f"Starting {config.app_name}")

    api = Api()

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

    log("SUCCESS", Tags.WINDOW, "Window created — starting webview loop")
    webview.start(debug=config.debug)
    log("INFO", Tags.MAIN, "Webview loop exited — bye!")


if __name__ == "__main__":
    main()