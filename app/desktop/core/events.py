"""
EventEmitter - backend -> frontend event bridge.

The backend never calls evaluate_js directly.
All frontend notifications go through this module.

Usage:
    from desktop.core.events import emitter

    emitter.boot_message("boot.initializingCore", 30)
    emitter.boot_message("boot.scanningGame", 42, {"name": "WotLK"})
    emitter.boot_done()
    emitter.emit("download_progress", {"percent": 72, "speed": 14.3})

The emitter stores a reference to the pywebview window after it is created.
Call `emitter.attach(window)` in main.py once the window exists.
"""
# Standard library
from __future__ import annotations

import json
from typing import Any

# Project imports
from desktop.utils.logger import log, Tags


class EventEmitter:
    """Encapsulates all evaluate_js calls made from the backend."""

    def __init__(self) -> None:
        self._window: Any = None

    def attach(self, window: Any) -> None:
        """
        Store a reference to the pywebview window.

        Args:
            window: The webview.Window instance from main.py.
        """
        self._window = window
        log("INFO", Tags.BRIDGE, "EventEmitter attached to window")

    def _js(self, expression: str) -> None:
        """
        Execute a JavaScript expression in the webview context.

        Args:
            expression: Valid JS string to evaluate in the frontend.
        """
        if self._window is None:
            log("WARNING", Tags.BRIDGE, f"emit called before window attach: {expression[:60]}")
            return
        try:
            self._window.evaluate_js(expression)
        except Exception as exc:
            log("ERROR", Tags.BRIDGE, f"evaluate_js failed: {exc}")

    def emit(self, event: str, payload: dict[str, Any]) -> None:
        """
        Generic event emitter — calls window.__zforge_<event>(payload).

        Args:
            event:   Snake-case event name (e.g. "download_progress").
            payload: JSON-serialisable dictionary passed to the handler.
        """
        handler = f"__zforge_{event}"
        serialised = json.dumps(payload)
        self._js(
            f"if (typeof window.{handler} === 'function') "
            f"window.{handler}({serialised});"
        )
        log("DEBUG", Tags.BRIDGE, f"emit({event}) → {serialised[:80]}")

    def boot_message(
        self,
        key: str,
        percent: int | float,
        params: dict[str, Any] | None = None,
    ) -> None:
        """
        Send a boot progress update to the splash screen.

        The frontend translates ``key`` via ``t(key, params)``. The backend
        never sends human-readable strings.

        Args:
            key: Translation key (e.g. "boot.initializingCore").
            percent: Completion percentage (0–100).
            params: Optional interpolation variables for the translation.
        """
        pct = max(0, min(100, int(percent)))
        payload: dict[str, Any] = {
            "key": key,
            "percent": pct,
            "params": params or {},
        }
        serialised: str = json.dumps(payload)
        self._js(
            f"if (typeof window.__zforge_boot_message === 'function') "
            f"window.__zforge_boot_message({serialised});"
        )
        log("INFO", Tags.BRIDGE, f"boot_message({pct}%) — {key} {params or {}}")

    def boot_message_legacy(self, message: str, percent: int | float) -> None:
        """
        Legacy shim that sends a raw string (deprecated).

        Args:
            message: Human-readable string (do not use for new code).
            percent: Completion percentage (0–100).
        """
        pct = max(0, min(100, int(percent)))
        safe_msg = message.replace("'", "\\'")
        self._js(
            f"if (typeof window.__zforge_boot_message === 'function') "
            f"window.__zforge_boot_message('{safe_msg}', {pct});"
        )
        log("INFO", Tags.BRIDGE, f"boot_message({pct}%) — {message}")

    def boot_done(self) -> None:
        """Signal the frontend that the boot sequence is complete."""
        self._js(
            "if (typeof window.__zforge_boot_done === 'function') "
            "window.__zforge_boot_done();"
        )
        log("SUCCESS", Tags.BRIDGE, "boot_done emitted")


# Singleton — import this everywhere that needs to emit events.
emitter = EventEmitter()