"""
WoWControlSDK management facade.

Re-exports validation, version and download helpers as a single
entry point. The actual logic lives in ``validation.py``,
``version.py`` and ``download.py``
"""

# Standard library
from __future__ import annotations

from typing import Any, Callable

# Project imports
from desktop.services.sdk.download import check_and_repair_on_boot, download_and_install
from desktop.services.sdk.validation import get_sdk_status, is_sdk_installed
from desktop.services.sdk.version import fetch_latest_release

ProgressCallback = Callable[[dict[str, Any]], None]

__all__ = [
    "check_and_repair_on_boot",
    "download_and_install",
    "fetch_latest_release",
    "get_sdk_status",
    "is_sdk_installed",
]