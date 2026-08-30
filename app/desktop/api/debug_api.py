"""
Debug and window control API.
"""

# Standard library
from __future__ import annotations

# Third-party
import webview

# Project imports
from desktop.utils.logger import log, Tags


def ping() -> str:
    """Health-check called by the frontend on startup to verify the bridge."""
    log("INFO", Tags.BRIDGE, "ping -> pong")
    return "pong"


def minimize_window() -> None:
    """Minimize the pywebview window."""
    if webview.windows:
        webview.windows[0].minimize()


def close_window() -> None:
    """Destroy the pywebview window and exit the application."""
    if webview.windows:
        webview.windows[0].destroy()
