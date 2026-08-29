"""
Public API class exposed to the frontend via pywebview bridge.
"""

# Standard library
from datetime import datetime

# Third-party
import webview

# Project imports
from desktop.models.game import Game, copy_custom_asset, scan_assets
from desktop.storage import config as config_store
from desktop.storage import db as db_store
from desktop.utils.logger import log, Tags


class Api:
    """Bridge API exposed to the React frontend via pywebview."""

    def __init__(self) -> None:
        """Create the bridge, with no window attached yet."""
        self._window: "webview.Window | None" = None

    def attach_window(self, window: "webview.Window") -> None:
        """
        Store the pywebview window reference.

        Required for file-dialog operations. Called by the host once the
        window is created.

        Args:
            window: The live pywebview window instance.
        """
        self._window = window

    def _active_window(self) -> "webview.Window | None":
        """Return the attached window, falling back to the global list."""
        if self._window is not None:
            return self._window
        if webview.windows:
            return webview.windows[0]
        return None

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
        return config_store.load_app_config().to_dict()

    def save_settings(self, payload: dict) -> dict:
        """
        Persist updated settings.

        Args:
            payload: Partial or full settings object from the frontend.

        Returns:
            dict: {"ok": bool, "error": str | None}
        """
        log("DEBUG", Tags.API, f"save_settings() called — keys: {list(payload.keys())}")
        current = config_store.load_app_config()
        current.theme = payload.get("theme", current.theme)
        current.last_active_game = payload.get("last_active_game", current.last_active_game)
        config_store.save_app_config(current)
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

    # ── Games ─────────────────────────────────────────────────────────────

    def list_games(self) -> list[dict]:
        """
        Return every saved game as a list of dictionaries.

        Returns:
            List of serialised ``Game`` objects (oldest first).
        """
        log("DEBUG", Tags.API, "list_games() called")
        return [game.to_dict() for game in db_store.list_games()]

    def add_game(self, payload: dict) -> dict:
        """
        Create and persist a new game.

        Args:
            payload: Game fields from the add/edit modal (id ignored).

        Returns:
            The created game as a dictionary.
        """
        game = Game.from_payload(payload)
        game.created_at = datetime.now().isoformat()
        db_store.add_game(game)
        log("INFO", Tags.API, f"add_game() -> {game.id} ({game.expansion})")
        return game.to_dict()

    def update_game(self, payload: dict) -> dict:
        """
        Update an existing game.

        Args:
            payload: Game fields; ``id`` selects the row to update.

        Returns:
            The updated game as a dictionary.
        """
        game = Game.from_payload(payload)
        db_store.update_game(game)
        log("INFO", Tags.API, f"update_game() -> {game.id}")
        return game.to_dict()

    def remove_game(self, game_id: str) -> dict:
        """
        Delete a game by id.

        Args:
            game_id: Identifier of the game to remove.

        Returns:
            Success envelope.
        """
        db_store.remove_game(game_id)
        log("INFO", Tags.API, f"remove_game() -> {game_id}")
        return {"ok": True, "error": None}

    # ── Application config ───────────────────────────────────────────────

    def get_app_config(self) -> dict:
        """
        Return the global application settings.

        Returns:
            Serialised ``AppSettings`` dictionary.
        """
        return config_store.load_app_config().to_dict()

    def save_app_config(self, payload: dict) -> dict:
        """
        Persist global application settings.

        Args:
            payload: Partial or full settings object from the frontend.

        Returns:
            Success envelope.
        """
        current = config_store.load_app_config()
        current.theme = payload.get("theme", current.theme)
        current.last_active_game = payload.get("last_active_game", current.last_active_game)
        config_store.save_app_config(current)
        return {"ok": True, "error": None}

    # ── Asset pickers ─────────────────────────────────────────────────────

    def list_assets(self) -> dict:
        """
        Return the bundled-asset catalogue for the UI.

        Returns:
            Manifest with expansions and available media pools.
        """
        return scan_assets()

    def select_exe(self) -> str | None:
        """
        Open a native file dialog to pick the WoW executable.

        Returns:
            Absolute path of the chosen ``.exe`` or ``None`` if cancelled.
        """
        window = self._active_window()
        if window is None:
            return None
        result = window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=("WoW Executable (*.exe)",),
        )
        if isinstance(result, (list, tuple)):
            return str(result[0]) if result else None
        return str(result) if result else None

    def select_custom_asset(self, kind: str) -> str | None:
        """
        Pick a custom media file and copy it into the app-data folder.

        Args:
            kind: One of ``icos``, ``logos`` or ``scenes``.

        Returns:
            Absolute path of the copied asset, or ``None`` if cancelled.
        """
        window = self._active_window()
        if window is None:
            return None
        filters = {
            "icos": ("Icon (*.ico;*.png)",),
            "logos": ("Image (*.png;*.jpg;*.jpeg)",),
            "scenes": ("Video (*.mp4;*.webm)",),
        }.get(kind, ("All files (*.*)",))
        result = window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=filters,
        )
        src = result[0] if isinstance(result, (list, tuple)) and result else result
        if not src:
            return None
        return copy_custom_asset(kind, str(src))