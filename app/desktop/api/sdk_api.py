"""
SDK API — thin bridge for Rich Presence SDK management.
"""

from __future__ import annotations

from desktop.services.sdk import manager as sdk_manager
from desktop.utils.logger import Tags, log


def get_sdk_status() -> dict[str, object]:
    """Return the current SDK installation status."""
    log("DEBUG", Tags.API, "get_sdk_status() called")
    return sdk_manager.get_sdk_status()


def install_sdk() -> dict[str, object]:
    """Download and install the latest SDK."""
    log("INFO", Tags.API, "install_sdk() called")
    return sdk_manager.download_and_install()


def check_sdk_update() -> dict[str, object] | None:
    """Fetch latest release info without installing."""
    log("DEBUG", Tags.API, "check_sdk_update() called")
    info = sdk_manager.fetch_latest_release()
    if not info:
        return None
    return info


def get_latest_sdk_info() -> dict[str, object] | None:
    """Alias for check_sdk_update for frontend naming."""
    return check_sdk_update()