"""
SDK installation validation.

Checks the local ``%APPDATA%/ZForge/tools`` directory for a valid
``WoWControlSDK-vX.Y.Z`` installation and reports status.
"""

# Standard library
from __future__ import annotations

from pathlib import Path
from typing import Any

# Project imports
from desktop.config import config as app_config
from desktop.constants import SDK_EXPECTED_PREFIX, SDK_REQUIRED_BINARIES
from desktop.services.sdk.version import fetch_latest_release, is_version_greater
from desktop.storage import config as config_store
from desktop.utils.paths import tools_dir
from desktop.services.sdk.version import parse_version


def find_installed_sdk() -> tuple[Path | None, str | None]:
    """
    Locate the newest valid SDK installation.

    Returns:
        Tuple of ``(path, version)`` or ``(None, None)`` when absent.
    """
    base = tools_dir()
    if not base.exists():
        return None, None
    candidates: list[tuple[Path, str]] = []
    for child in base.iterdir():
        if not child.is_dir():
            continue
        if not child.name.startswith(SDK_EXPECTED_PREFIX):
            continue
        ver = child.name[len(SDK_EXPECTED_PREFIX) :].lstrip("v")
        candidates.append((child, ver))
    if not candidates:
        return None, None
    candidates.sort(key=lambda x: parse_version(x[1]), reverse=True)
    for path, ver in candidates:
        if is_sdk_valid(path):
            return path, ver
    return candidates[0][0], candidates[0][1]


def is_sdk_valid(path: Path) -> bool:
    """
    Check if the SDK at ``path`` contains required binaries.

    Args:
        path: Installation directory to validate.

    Returns:
        True when ``binaries/WoWControlSDK.dll`` and ``binaries/WowInjector.exe`` exist.
    """
    bin_dir = path / "binaries"
    for name in SDK_REQUIRED_BINARIES:
        if not (bin_dir / name).exists():
            return False
    return True


def missing_files(path: Path) -> list[str]:
    """
    List missing required binaries for the given installation.

    Args:
        path: Installation directory to inspect.

    Returns:
        List of missing relative paths like ``"binaries/WoWControlSDK.dll"``.
    """
    bin_dir = path / "binaries"
    missing: list[str] = []
    for name in SDK_REQUIRED_BINARIES:
        if not (bin_dir / name).exists():
            missing.append(f"binaries/{name}")
    return missing


def is_sdk_installed() -> bool:
    """
    Check if a valid SDK is installed.

    Returns:
        True when a valid installation exists.
    """
    path, _ = find_installed_sdk()
    return path is not None and is_sdk_valid(path)


def get_sdk_status() -> dict[str, Any]:
    """
    Return the current SDK installation and config status.

    Includes local validation, application ID check, and remote version
    comparison for update availability.

    Returns:
        Dictionary with ``installed``, ``valid``, ``version``, ``path``,
        ``missing_files``, ``needs_install``, ``needs_repair``,
        ``application_id_configured``, ``discord_enabled``,
        ``discord_auto_update``, ``sdk_last_error``, ``latest_version``,
        ``latest_url`` and ``update_available``.
    """
    path, version = find_installed_sdk()
    installed = path is not None
    valid = path is not None and is_sdk_valid(path)
    missing = missing_files(path) if path else []
    needs_repair = installed and not valid
    needs_install = not installed or needs_repair

    app_settings = config_store.load_app_config()
    application_id_configured = bool(app_config.discord_client_id.strip())
    latest_info = None
    latest_version: str | None = None
    update_available = False
    try:
        latest_info = fetch_latest_release()
        if latest_info:
            latest_version = str(latest_info.get("version"))
            if version and latest_version:
                update_available = is_version_greater(latest_version, version)
            elif not version and latest_version:
                update_available = True
    except Exception:
        pass

    return {
        "installed": installed,
        "valid": valid,
        "version": version,
        "path": str(path) if path else None,
        "missing_files": missing,
        "needs_install": needs_install,
        "needs_repair": needs_repair,
        "application_id_configured": application_id_configured,
        "discord_enabled": bool(app_settings.discord_enabled),
        "discord_auto_update": bool(app_settings.discord_auto_update),
        "sdk_last_error": app_settings.sdk_last_error,
        "latest_version": latest_version,
        "latest_url": latest_info.get("browser_download_url") if latest_info else None,
        "update_available": update_available,
    }