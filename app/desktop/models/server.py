"""
Server / realmlist catalogue.

Combines the bundled, read-only ``servers.json`` catalogue shipped with the
app with user-saved custom realmlists (stored in the database), so the
frontend can offer autocomplete suggestions for the realm list + realm name
fields in the game settings modal.
"""

# Standard library
from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


# Project imports
from desktop.utils.paths import servers_data_path
from desktop.storage import db as db_store


@dataclass
class ServerEntry:
    """One selectable server (or custom realmlist) in the picker."""

    name: str
    logo: str | None
    realmlists: list[str]
    realms: list[str]
    website: str = ""
    custom: bool = False

    def to_dict(self) -> dict[str, Any]:
        """Serialise the entry to a JSON-friendly dictionary."""
        return asdict(self)


def _load_bundled() -> list[ServerEntry]:
    """Parse the bundled, read-only servers.json catalogue."""
    path: Path = servers_data_path()
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []

    entries: list[ServerEntry] = []
    for item in raw:
        logo_name = item.get("logo")
        entries.append(
            ServerEntry(
                name=item.get("name", ""),
                logo=f"/assets/servers/logos/{logo_name}" if logo_name else None,
                realmlists=list(item.get("realmlists", [])),
                realms=list(item.get("realms", [])),
                website=item.get("website", ""),
                custom=False,
            )
        )
    return entries


def list_servers() -> list[dict[str, Any]]:
    """
    Return the full server catalogue: bundled entries plus saved custom ones.

    Returns:
        List of serialised ``ServerEntry`` dictionaries.
    """
    
    bundled = _load_bundled()
    custom = [
        ServerEntry(
            name=row["name"],
            logo=None,
            realmlists=[row["realmlist"]],
            realms=row["realms"],
            website="",
            custom=True,
        )
        for row in db_store.list_custom_servers()
    ]
    return [entry.to_dict() for entry in [*bundled, *custom]]
