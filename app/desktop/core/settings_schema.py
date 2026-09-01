"""
Settings schema service.

Loads per-expansion JSON schemas and exposes helpers for defaults,
validation and WTF mapping.
"""

# Standard library
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# Project imports
from desktop.utils.logger import log, Tags

SCHEMA_ROOT: Path = Path(__file__).resolve().parents[1] / "data" / "games" / "wow"

_schema_cache: dict[str, dict[str, Any]] = {}


def _schema_path(version_id: str) -> Path:
    """
    Return the filesystem path for a version's schema JSON.

    Args:
        version_id: Identifier like ``wow-wotlk-335a``.

    Returns:
        Path to the JSON file.
    """
    return SCHEMA_ROOT / f"{version_id.split('wow-')[-1]}.json" if version_id.startswith("wow-") else SCHEMA_ROOT / f"{version_id}.json"


def load_schema(version_id: str) -> dict[str, Any] | None:
    """
    Load a version's schema from disk.

    Args:
        version_id: Schema identifier (e.g. ``wow-wotlk-335a``).

    Returns:
        Parsed JSON dictionary, or ``None`` when the file is missing or invalid.
    """
    if version_id in _schema_cache:
        return _schema_cache[version_id]
    
    candidates: list[Path] = [
        SCHEMA_ROOT / f"{version_id}.json",
        SCHEMA_ROOT / f"{version_id.replace('wow-', '')}.json",
        SCHEMA_ROOT / "wotlk-335a.json",
    ]
    for path in candidates:
        if path.exists():
            try:
                data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8-sig"))
                _schema_cache[version_id] = data
                log("DEBUG", Tags.SETTINGS, f"Loaded schema {version_id} from {path.name}")
                return data
            except (json.JSONDecodeError, OSError) as exc:
                log("WARNING", Tags.SETTINGS, f"Failed to load schema {path}: {exc}")
                return None

    fallback: Path = SCHEMA_ROOT / "wotlk-335a.json"
    if fallback.exists():
        try:
            data = json.loads(fallback.read_text(encoding="utf-8-sig"))
            _schema_cache[version_id] = data
            return data
        except (json.JSONDecodeError, OSError):
            return None

    log("WARNING", Tags.SETTINGS, f"Schema not found for {version_id}")
    return None


def get_default_settings(version_id: str) -> dict[str, Any]:
    """
    Build a default settings dictionary for a version from its schema.

    Args:
        version_id: Schema identifier.

    Returns:
        Dictionary of setting key to default value.
    """
    schema: dict[str, Any] | None = load_schema(version_id)
    if schema is None:
        return {}

    defaults: dict[str, Any] = {}
    for category in schema.get("categories", []):
        for setting in category.get("settings", []):
            key: str = setting.get("key", "")
            if key:
                defaults[key] = setting.get("default")
    return defaults


def list_available_versions() -> list[str]:
    """
    List all available schema version ids found on disk.

    Returns:
        Sorted list of version identifiers.
    """
    if not SCHEMA_ROOT.exists():
        return []
    versions: list[str] = []
    for path in SCHEMA_ROOT.glob("*.json"):
        data: dict[str, Any] | None = None
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
            vid: str | None = data.get("id")
            if vid:
                versions.append(vid)
            else:
                versions.append(path.stem)
        except (json.JSONDecodeError, OSError):
            versions.append(path.stem)
    return sorted(versions)
