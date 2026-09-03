"""
SDK version helpers.

Parses version strings and fetches the latest GitHub release.
"""

# Standard librarys
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any

# Project imports
from desktop.constants import SDK_GITHUB_LATEST_URL
from desktop.utils.logger import Tags, log

_VERSION_RE = re.compile(r"v?(\d+(?:\.\d+)*)")


def parse_version(v: str) -> tuple[int, ...]:
    """
    Parse a version string into a comparable tuple.

    Args:
        v: Raw version string, e.g. ``"v1.0.0"`` or ``"1.2.3"``.

    Returns:
        Tuple of ints for comparison, ``(0,)`` when unparsable.
    """
    m = _VERSION_RE.search(v or "")
    if not m:
        return (0,)
    try:
        return tuple(int(x) for x in m.group(1).split("."))
    except ValueError:
        return (0,)


def is_version_greater(a: str, b: str) -> bool:
    """
    Check if version ``a`` is greater than ``b``.

    Args:
        a: Candidate version.
        b: Baseline version.

    Returns:
        True when ``a`` is newer than ``b``.
    """
    return parse_version(a) > parse_version(b)


def fetch_latest_release() -> dict[str, Any] | None:
    """
    Fetch the latest GitHub release for the SDK.

    Returns:
        Dictionary with ``tag_name``, ``version``, ``browser_download_url``
        and ``size`` when successful, else ``None``.
    """
    req = urllib.request.Request(
        SDK_GITHUB_LATEST_URL,
        headers={"User-Agent": "ZForge", "Accept": "application/vnd.github+json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        log("WARNING", Tags.API, f"fetch_latest_release failed: {exc}")
        return None

    tag = str(data.get("tag_name") or "").strip()
    assets: list[dict[str, Any]] = data.get("assets") or []
    browser_url: str | None = None
    size: int | None = None
    for asset in assets:
        name = str(asset.get("name") or "")
        if name.startswith("WoWControlSDK-") and name.endswith(".zip"):
            browser_url = str(asset.get("browser_download_url") or "")
            size = asset.get("size")
            break
    if not tag or not browser_url:
        log("WARNING", Tags.API, f"fetch_latest_release: missing tag or url tag={tag} url={browser_url}")
        return None
    version = tag.lstrip("v")
    return {
        "tag_name": tag,
        "version": version,
        "browser_download_url": browser_url,
        "size": size,
        "raw": data,
    }