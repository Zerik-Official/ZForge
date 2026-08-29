"""
Public API class exposed to the frontend via pywebview bridge.
"""

# Third-party
import webview

# Project imports
from desktop.utils.logger import log, Tags


class Api:
    """Bridge API exposed to the React frontend via pywebview."""

    def launch_game(self) -> dict:
        """
        Start the WoW 3.3.5a client process.

        Returns:
            dict: {"ok": bool, "error": str | None}
        """
        log("DEBUG", Tags.API, "launch_game() called")
        # TODO: delegate to services/wow/launcher.py
        return {"ok": True, "error": None}

    def install_client(self) -> dict:
        """
        Trigger the full client installation flow.

        Returns:
            dict: {"ok": bool, "error": str | None}
        """
        log("DEBUG", Tags.API, "install_client() called")
        # TODO: delegate to services/download/manager.py
        return {"ok": True, "error": None}

    def repair_client(self) -> dict:
        """
        Start the client repair / integrity check flow.

        Returns:
            dict: {"ok": bool, "error": str | None}
        """
        log("DEBUG", Tags.API, "repair_client() called")
        # TODO: delegate to services/wow/repair.py
        return {"ok": True, "error": None}

    def get_settings(self) -> dict:
        """
        Return the current application settings.

        Returns:
            dict: Serialised settings object.
        """
        log("DEBUG", Tags.API, "get_settings() called")
        # TODO: delegate to services/config/profiles.py
        return {}

    def save_settings(self, payload: dict) -> dict:
        """
        Persist updated settings.

        Args:
            payload: Partial or full settings object from the frontend.

        Returns:
            dict: {"ok": bool, "error": str | None}
        """
        log("DEBUG", Tags.API, f"save_settings() called — keys: {list(payload.keys())}")
        # TODO: delegate to services/config/profiles.py
        return {"ok": True, "error": None}

    def ping(self) -> str:
        """
        Health-check called by the frontend on startup to verify the bridge.

        Returns:
            str: "pong"
        """
        log("INFO", Tags.BRIDGE, "ping -> pong")
        return "pong"

    def minimize_window(self) -> None:
        """Minimize the pywebview window."""
        if webview.windows:
            webview.windows[0].minimize()

    def close_window(self) -> None:
        """Destroy the pywebview window and exit the application."""
        if webview.windows:
            webview.windows[0].destroy()