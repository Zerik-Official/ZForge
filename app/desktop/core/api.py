"""
Public API class exposed to the frontend via pywebview bridge.
"""

# Standard library
from datetime import datetime

# Third-party
import webview

# Project imports
from desktop.api import launcher_api
from desktop.core import game_config
from desktop.models import server as server_catalog
from desktop.models.game import Game, copy_custom_asset, scan_assets
from desktop.storage import config as config_store
from desktop.storage import db as db_store
from desktop.utils import display
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

    def launch_game(self, game_id: str) -> dict:
        """
        Start the WoW client for the selected game.

        Args:
            game_id: Identifier of the saved game to launch.

        Returns:
            dict: {"ok": bool, "error": str | None}
        """
        log("DEBUG", Tags.API, f"launch_game() called — id={game_id}")
        game = db_store.get_game(game_id)
        if game is None:
            return {"ok": False, "error": "Game not found"}
        return launcher_api.launch_wow(game)

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
        try:
            db_store.save_game_settings(game.id, game_config.scan_game_config(game.exe_path))
            log("INFO", Tags.API, f"add_game() seeded settings -> {game.id}")
        except OSError as exc:
            log("WARNING", Tags.API, f"add_game() could not scan settings for {game.id}: {exc}")
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

    # ── Per-game settings ─────────────────────────────────────────────────

    def get_display_resolution(self) -> dict:
        """
        Return the primary monitor's native resolution.

        Returns:
            Dictionary with ``width`` and ``height`` in pixels.
        """
        width, height = display.get_primary_resolution()
        log("DEBUG", Tags.API, f"get_display_resolution() -> {width}x{height}")
        return {"width": width, "height": height}

    def get_game_settings(self, game_id: str) -> dict:
        """
        Return the saved launcher settings for a game.

        Args:
            game_id: Identifier of the game.

        Returns:
            Settings dictionary (empty when nothing is stored yet).
        """
        log("DEBUG", Tags.API, f"get_game_settings() -> {game_id}")
        settings = db_store.get_game_settings(game_id)
        return settings if settings is not None else {}

    def save_game_settings(self, game_id: str, payload: dict) -> dict:
        """
        Persist edited launcher settings for a game.

        Args:
            game_id: Identifier of the game.
            payload: Serialised settings dictionary from the frontend.

        Returns:
            Success envelope.
        """
        log("DEBUG", Tags.API, f"save_game_settings() -> {game_id}")
        db_store.save_game_settings(game_id, payload)
        return {"ok": True, "error": None}

    def scan_game_config(self, game_id: str) -> dict:
        """
        Scan a game's client files and return the detected settings.

        Args:
            game_id: Identifier of the game.

        Returns:
            Settings dictionary, or an error envelope when not found.
        """
        log("DEBUG", Tags.API, f"scan_game_config() -> {game_id}")
        game = db_store.get_game(game_id)
        if game is None:
            return {"ok": False, "error": "Game not found"}
        return game_config.scan_game_config(game.exe_path)

    def apply_game_settings(self, game_id: str) -> dict:
        """
        Write the saved settings into the game's configuration files.

        Args:
            game_id: Identifier of the game.

        Returns:
            Success envelope; ``error`` carries a reason on failure.
        """
        log("DEBUG", Tags.API, f"apply_game_settings() -> {game_id}")
        game = db_store.get_game(game_id)
        if game is None:
            return {"ok": False, "error": "Game not found"}
        settings = db_store.get_game_settings(game_id)
        if settings is None:
            return {"ok": False, "error": "No saved settings for this game"}
        try:
            game_config.apply_game_settings(settings, game.exe_path)
        except OSError as exc:
            return {"ok": False, "error": str(exc)}
        return {"ok": True, "error": None}

    def pull_game_settings(self, game_id: str) -> dict:
        """
        Overwrite the saved settings with what the game files currently hold.

        Args:
            game_id: Identifier of the game.

        Returns:
            Success envelope; ``error`` carries a reason on failure.
        """
        log("DEBUG", Tags.API, f"pull_game_settings() -> {game_id}")
        game = db_store.get_game(game_id)
        if game is None:
            return {"ok": False, "error": "Game not found"}
        try:
            db_store.save_game_settings(game_id, game_config.scan_game_config(game.exe_path))
        except OSError as exc:
            return {"ok": False, "error": str(exc)}
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

    # ── Server / realmlist catalogue ──────────────────────────────

    def list_servers(self) -> list[dict]:
        """
        Return the combined bundled + user-saved custom server catalogue.

        Returns:
            List of serialised server entries for the realm-list picker.
        """
        return server_catalog.list_servers()

    def save_custom_server(self, payload: dict) -> dict:
        """
        Persist a brand-new custom realmlist globally.

        Args:
            payload: ``{"realmlist": str, "name": str | None, "realm": str | None}``.

        Returns:
            Success envelope.
        """
        realmlist = (payload.get("realmlist") or "").strip()
        if not realmlist:
            return {"ok": False, "error": "Realmlist vacío"}
        name = (payload.get("name") or realmlist).strip()
        realm = (payload.get("realm") or "").strip()
        db_store.add_custom_server(realmlist, name, [realm] if realm else [])
        log("INFO", Tags.API, f"save_custom_server() -> {realmlist}")
        return {"ok": True, "error": None}

    def add_custom_realm(self, realmlist: str, realm: str) -> dict:
        """
        Append a new realm to an already-saved custom realmlist.

        Args:
            realmlist: The custom realmlist to update.
            realm: New realm name to add.

        Returns:
            Success envelope.
        """
        realm = (realm or "").strip()
        if not realm:
            return {"ok": True, "error": None}
        db_store.add_realm_to_custom_server((realmlist or "").strip(), realm)
        log("INFO", Tags.API, f"add_custom_realm() -> {realmlist} / {realm}")
        return {"ok": True, "error": None}