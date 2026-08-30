"""
Helpers for reading and editing World of Warcraft ``.wtf`` configuration files.

Two flavours exist:

* ``Config.wtf`` uses ``SET key "value"`` directives.  Keys we manage are
  updated in place; every other line is preserved untouched.
* ``realmlist.wtf`` uses plain ``set realmlist <host>`` lines.  A line prefixed
  with ``-`` (e.g. ``-set realmlist backup.host``) is a *disabled* entry; the
  active realm is always the first line **without** the ``-`` prefix.  We only
  ever rewrite that active line and leave the disabled backups alone.
"""

# Standard library
from __future__ import annotations
import re
from pathlib import Path

_SET_LINE: re.Pattern = re.compile(r"^SET\s+(\S+)\s+(.*)$", re.IGNORECASE)
_REALMLIST_ACTIVE: re.Pattern = re.compile(r"^set\s+realmlist\b", re.IGNORECASE)


def parse_config_wtf(path: Path) -> dict[str, str]:
    """
    Read every ``SET key "value"`` directive from a ``Config.wtf`` file.

    Args:
        path: Location of the ``Config.wtf`` file (may be missing).

    Returns:
        Mapping of configuration key to its string value.
    """
    result: dict[str, str] = {}
    if not path.exists():
        return result
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        match = _SET_LINE.match(raw.strip())
        if not match:
            continue
        key = match.group(1)
        value = match.group(2).strip()
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1]
        result[key] = value
    return result


def get_config_value(parsed: dict[str, str], key: str, default: str = "") -> str:
    """
    Case-insensitive lookup inside a parsed ``Config.wtf`` mapping.

    Args:
        parsed: Output of :func:`parse_config_wtf`.
        key: Key to look up (case-insensitive).
        default: Value returned when the key is absent.

    Returns:
        The stored value or ``default``.
    """
    lowered = key.lower()
    for stored_key, value in parsed.items():
        if stored_key.lower() == lowered:
            return value
    return default


def write_config_wtf(path: Path, updates: dict[str, str | None]) -> None:
    """
    Apply ``SET`` updates to a ``Config.wtf`` file, preserving every other line.

    A value of ``None`` removes the matching key entirely (used for settings
    whose absence carries meaning, e.g. fullscreen when ``gxWindow`` is gone).

    Args:
        path: File to rewrite.
        updates: Mapping of key to new value, or ``None`` to delete the key.
    """
    original = path.read_text(encoding="utf-8", errors="ignore").splitlines() if path.exists() else []
    pending = dict(updates)
    out: list[str] = []

    for line in original:
        match = _SET_LINE.match(line.strip())
        if match:
            key = match.group(1)
            target = next((candidate for candidate in pending if candidate.lower() == key.lower()), None)
            if target is not None:
                new_value = pending.pop(target)
                if new_value is not None:
                    out.append(f'SET {key} "{new_value}"')
                continue
        out.append(line)

    for key, value in pending.items():
        if value is not None:
            out.append(f'SET {key} "{value}"')

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(out) + ("\n" if out else ""), encoding="utf-8")


def set_realmlist_value(path: Path, value: str) -> None:
    """
    Replace the active realm list inside a ``realmlist.wtf`` file.

    The active line is the first ``set realmlist`` entry without a leading
    ``-``.  Disabled (``-set``) backups are kept.  The file is created when it
    does not exist yet.

    Args:
        path: ``realmlist.wtf`` file to edit or create.
        value: New realm list host to write into the active line.
    """
    original = path.read_text(encoding="utf-8", errors="ignore").splitlines() if path.exists() else []
    replaced = False
    out: list[str] = []

    for line in original:
        stripped = line.strip()
        if _REALMLIST_ACTIVE.match(stripped) and not stripped.startswith("-"):
            out.append(f"set realmlist {value}")
            replaced = True
        else:
            out.append(line)

    if not replaced:
        out.append(f"set realmlist {value}")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(out) + ("\n" if out else ""), encoding="utf-8")
