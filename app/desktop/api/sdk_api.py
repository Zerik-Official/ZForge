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


def get_sdk_license() -> dict[str, object]:
    """
    Fetch the Apache 2.0 LICENSE text from the SDK repository.

    Returns:
        Dictionary with ``ok``, ``content`` and ``error``.
    """
    import urllib.error
    import urllib.request

    url = "https://raw.githubusercontent.com/Zerik-Official/WoWControlSDK/main/LICENSE"
    req = urllib.request.Request(url, headers={"User-Agent": "ZForge"})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            text = resp.read().decode("utf-8", errors="ignore")
        if not text.strip():
            return {"ok": False, "content": None, "error": "LICENSE vacío"}
        return {"ok": True, "content": text, "error": None}
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError) as exc:
        log("WARNING", Tags.API, f"get_sdk_license failed: {exc}")
        return {"ok": False, "content": None, "error": str(exc)}


def open_external_url(url: str) -> dict[str, object]:
    """
    Open an external URL in the system browser.

    Args:
        url: Absolute URL to open.

    Returns:
        Result dictionary.
    """
    from desktop.utils.browser import open_url

    log("INFO", Tags.API, f"open_external_url() -> {url}")
    return open_url(url)