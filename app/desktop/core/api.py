"""
Public API class exposed to the frontend via pywebview bridge.
"""

# Third-party
import webview

# Project imports
from desktop.api import addon_api
from desktop.api import debug_api
from desktop.api import launcher_api
from desktop.api import sdk_api
from desktop.api import settings_api


class Api:
    """Bridge API exposed to the React frontend via pywebview."""

    def __init__(self) -> None:
        """Create the bridge, with no window attached yet."""
        self._window: webview.Window | None = None

    def attach_window(self, window: webview.Window) -> None:
        """
        Store the pywebview window reference.

        Required for file-dialog operations. Called by the host once the
        window is created.

        Args:
            window: The live pywebview window instance.
        """
        self._window = window

    def _active_window(self) -> webview.Window | None:
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
        return launcher_api.launch_game(game_id)

    def install_client(self) -> dict:
        """
        Trigger the full client installation flow.

        Returns:
            dict: {"ok": bool, "error": str | None}
        """
        return addon_api.install_client()

    def repair_client(self) -> dict:
        """
        Start the client repair / integrity check flow.

        Returns:
            dict: {"ok": bool, "error": str | None}
        """
        return addon_api.repair_client()

    def get_settings(self) -> dict:
        """
        Return the current application settings.

        Returns:
            dict: Serialised settings object.
        """
        return settings_api.get_settings()

    def save_settings(self, payload: dict) -> dict:
        """
        Persist updated settings.

        Args:
            payload: Partial or full settings object from the frontend.

        Returns:
            dict: {"ok": bool, "error": str | None}
        """
        return settings_api.save_settings(payload)

    def ping(self) -> str:
        """
        Health-check called by the frontend on startup to verify the bridge.

        Returns:
            str: "pong"
        """
        return debug_api.ping()

    def minimize_window(self) -> None:
        """Minimize the pywebview window."""
        debug_api.minimize_window()

    def close_window(self) -> None:
        """Destroy the pywebview window and exit the application."""
        debug_api.close_window()

    # ── Games ─────────────────────────────────────────────────────────────

    def list_games(self) -> list[dict]:
        """
        Return every saved game as a list of dictionaries.

        Returns:
            List of serialised ``Game`` objects (oldest first).
        """
        return launcher_api.list_games()

    def add_game(self, payload: dict) -> dict:
        """
        Create and persist a new game.

        Args:
            payload: Game fields from the add/edit modal (id ignored).

        Returns:
            The created game as a dictionary.
        """
        return launcher_api.add_game(payload)

    def update_game(self, payload: dict) -> dict:
        """
        Update an existing game.

        Args:
            payload: Game fields; ``id`` selects the row to update.

        Returns:
            The updated game as a dictionary.
        """
        return launcher_api.update_game(payload)

    def remove_game(self, game_id: str) -> dict:
        """
        Delete a game by id.

        Args:
            game_id: Identifier of the game to remove.

        Returns:
            Success envelope.
        """
        return launcher_api.remove_game(game_id)

    # ── Application config ───────────────────────────────────────────────

    def get_app_config(self) -> dict:
        """
        Return the global application settings.

        Returns:
            Serialised ``AppSettings`` dictionary.
        """
        return settings_api.get_app_config()

    def save_app_config(self, payload: dict) -> dict:
        """
        Persist global application settings.

        Args:
            payload: Partial or full settings object from the frontend.

        Returns:
            Success envelope.
        """
        return settings_api.save_app_config(payload)

    # ── Per-game settings ─────────────────────────────────────────────────

    def get_display_resolution(self) -> dict:
        """
        Return the primary monitor's native resolution.

        Returns:
            Dictionary with ``width`` and ``height`` in pixels.
        """
        return settings_api.get_display_resolution()

    def get_game_settings(self, game_id: str) -> dict:
        """
        Return the saved launcher settings for a game.

        Args:
            game_id: Identifier of the game.

        Returns:
            Settings dictionary (empty when nothing is stored yet).
        """
        return settings_api.get_game_settings(game_id)

    def save_game_settings(self, game_id: str, payload: dict) -> dict:
        """
        Persist edited launcher settings for a game.

        Args:
            game_id: Identifier of the game.
            payload: Serialised settings dictionary from the frontend.

        Returns:
            Success envelope.
        """
        return settings_api.save_game_settings(game_id, payload)

    def scan_game_config(self, game_id: str) -> dict:
        """
        Scan a game's client files and return the detected settings.

        Args:
            game_id: Identifier of the game.

        Returns:
            Settings dictionary, or an error envelope when not found.
        """
        return settings_api.scan_game_config(game_id)

    def apply_game_settings(self, game_id: str) -> dict:
        """
        Write the saved settings into the game's configuration files.

        Args:
            game_id: Identifier of the game.

        Returns:
            Success envelope; ``error`` carries a reason on failure.
        """
        return settings_api.apply_game_settings(game_id)

    def pull_game_settings(self, game_id: str) -> dict:
        """
        Overwrite the saved settings with what the game files currently hold.

        Args:
            game_id: Identifier of the game.

        Returns:
            Success envelope; ``error`` carries a reason on failure.
        """
        return settings_api.pull_game_settings(game_id)

    def get_settings_schema(self, version_id: str) -> dict:
        """
        Return the settings schema for a given game version.

        Args:
            version_id: Schema identifier like ``wow-wotlk-335a``.

        Returns:
            Schema dictionary or error envelope.
        """
        return settings_api.get_settings_schema(version_id)

    def list_settings_versions(self) -> list[str]:
        """Return all available settings schema version ids."""
        return settings_api.list_settings_versions()

    def list_audio_devices(self) -> list[dict]:
        """Return available audio output devices."""
        return settings_api.list_audio_devices()

    # ── Asset pickers ─────────────────────────────────────────────────────

    def list_assets(self) -> dict:
        """
        Return the bundled-asset catalogue for the UI.

        Returns:
            Manifest with expansions and available media pools.
        """
        return addon_api.list_assets()

    def select_exe(self) -> str | None:
        """
        Open a native file dialog to pick the WoW executable.

        Returns:
            Absolute path of the chosen ``.exe`` or ``None`` if cancelled.
        """
        return addon_api.select_exe(self._active_window())

    def select_custom_asset(self, kind: str) -> str | None:
        """
        Pick a custom media file and copy it into the app-data folder.

        Args:
            kind: One of ``icos``, ``logos`` or ``scenes``.

        Returns:
            Absolute path of the copied asset, or ``None`` if cancelled.
        """
        return addon_api.select_custom_asset(self._active_window(), kind)

    # ── Server / realmlist catalogue ──────────────────────────────

    def list_servers(self) -> list[dict]:
        """
        Return the combined bundled + user-saved custom server catalogue.

        Returns:
            List of serialised server entries for the realm-list picker.
        """
        return settings_api.list_servers()

    def save_custom_server(self, payload: dict) -> dict:
        """
        Persist a brand-new custom realmlist globally.

        Args:
            payload: ``{"realmlist": str, "name": str | None, "realm": str | None}``.

        Returns:
            Success envelope.
        """
        return settings_api.save_custom_server(payload)

    def add_custom_realm(self, realmlist: str, realm: str) -> dict:
        """
        Append a new realm to an already-saved custom realmlist.

        Args:
            realmlist: The custom realmlist to update.
            realm: New realm name to add.

        Returns:
            Success envelope.
        """
        return settings_api.add_custom_realm(realmlist, realm)

    def reorder_games(self, ordered_ids: list[str]) -> dict:
        """
        Persist a new order for the dock.

        Args:
            ordered_ids: Game ids in the desired display order.

        Returns:
            Success envelope.
        """
        return launcher_api.reorder_games(ordered_ids)

    # ── SDK / Rich Presence ───────────────────────────────────────────────

    def get_sdk_status(self) -> dict:
        """Return the current SDK installation and config status."""
        return sdk_api.get_sdk_status()

    def install_sdk(self) -> dict:
        """Download and install the latest SDK."""
        return sdk_api.install_sdk()

    def check_sdk_update(self) -> dict | None:
        """Check GitHub for a newer SDK release."""
        return sdk_api.check_sdk_update()

    def get_sdk_license(self) -> dict:
        """Fetch the SDK LICENSE text."""
        return sdk_api.get_sdk_license()

    def open_external_url(self, url: str) -> dict:
        """Open an external URL in the system browser."""
        return sdk_api.open_external_url(url)