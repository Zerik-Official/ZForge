"""
Primary display capabilities used to bound graphics options.

World of Warcraft only offers a fixed pool of resolutions, but the maximum one
must match the user's real monitor.  We resolve it through ``screeninfo`` and
fall back to a sensible default when the library or a monitor is unavailable.
"""

# Standard library
from __future__ import annotations
from typing import Tuple

# Third-party
from screeninfo import get_monitors

def get_primary_resolution() -> Tuple[int, int]:
    """
    Return the width and height of the primary monitor in pixels.

    Returns:
        ``(width, height)`` of the first monitor, or ``(1920, 1080)`` when it
        cannot be determined.
    """
    try:
        

        monitors = get_monitors()
        if monitors:
            monitor = monitors[0]
            return (int(monitor.width), int(monitor.height))
    except Exception:
        pass
    return (1920, 1080)


def get_primary_refresh_rate() -> int:
    """
    Return the refresh rate (Hz) of the primary monitor, snapped to a value.

    Returns:
        Refresh rate in Hz, or ``60`` when it cannot be determined.
    """
    try:

        monitors = get_monitors()
        if monitors:
            rate = getattr(monitors[0], "refresh_rate", None)
            if rate:
                return int(rate)
    except Exception:
        pass
    return 60
