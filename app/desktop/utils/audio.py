"""
Audio device enumeration.

Provides a list of available output devices for the sound settings dropdown.
Falls back to a default entry when enumeration is not available.
"""

# Standard library
from __future__ import annotations

from typing import Any

# Third-party
import sounddevice as sd


def list_output_devices() -> list[dict[str, Any]]:
    """
    Return available audio output devices.

    Returns:
        List of dictionaries with ``index`` and ``name`` keys. Always
        includes a sentinel ``Default`` entry at index 0.
    """
    devices: list[dict[str, Any]] = [{"index": 0, "name": "Default"}]

    try:
        
        for idx, dev in enumerate(sd.query_devices()):
            if dev.get("max_output_channels", 0) > 0:
                devices.append({"index": len(devices), "name": dev.get("name", f"Device {idx}")})
        if len(devices) > 1:
            return devices
    except Exception:
        pass

    return devices
