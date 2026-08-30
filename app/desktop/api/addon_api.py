"""
Addon and asset picker API.
"""

# Standard library
from __future__ import annotations

# Third-party
import webview

# Project imports
from desktop.services.wow import scanner as wow_scanner
from desktop.utils.files import copy_custom_asset
from desktop.utils.logger import log, Tags


def install_client() -> dict[str, object]:
    """Trigger the full client installation flow."""
    log("DEBUG", Tags.API, "install_client() called")
    return {"ok": True, "error": None}


def repair_client() -> dict[str, object]:
    """Start the client repair / integrity check flow."""
    log("DEBUG", Tags.API, "repair_client() called")
    return {"ok": True, "error": None}


def list_assets() -> dict[str, object]:
    """Return the bundled-asset catalogue for the UI."""
    return wow_scanner.scan_assets()


def select_exe(window: webview.Window | None) -> str | None:
    """
    Open a native file dialog to pick the WoW executable.

    Args:
        window: The active pywebview window.

    Returns:
        Absolute path of the chosen ``.exe`` or ``None`` if cancelled.
    """
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


def select_custom_asset(window: webview.Window | None, kind: str) -> str | None:
    """
    Pick a custom media file and copy it into the app-data folder.

    Args:
        window: The active pywebview window.
        kind: One of ``icos``, ``logos`` or ``scenes``.

    Returns:
        Absolute path of the copied asset, or ``None`` if cancelled.
    """
    if window is None:
        return None
    filters: dict[str, tuple[str, ...]] = {
        "icos": ("Icon (*.ico;*.png)",),
        "logos": ("Image (*.png;*.jpg;*.jpeg)",),
        "scenes": ("Video (*.mp4;*.webm)",),
    }
    result = window.create_file_dialog(
        webview.FileDialog.OPEN,
        allow_multiple=False,
        file_types=filters.get(kind, ("All files (*.*)",)),
    )
    src: str | None = result[0] if isinstance(result, (list, tuple)) and result else result  # type: ignore[assignment]
    if not src:
        return None
    return copy_custom_asset(kind, str(src))