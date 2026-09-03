"""
Browser helpers for opening external URLs.

Uses :mod:`webbrowser` to avoid native anchor tooltips and keep
navigation outside the pywebview context.
"""

from __future__ import annotations

import webbrowser


def open_url(url: str) -> dict[str, object]:
    """
    Open ``url`` in the default system browser.

    Args:
        url: Absolute HTTP(S) URL to open.

    Returns:
        Result dictionary with ``ok`` and ``error``.
    """
    url = (url or "").strip()
    if not url:
        return {"ok": False, "error": "URL vacía"}
    if not url.startswith(("http://", "https://")):
        return {"ok": False, "error": "URL debe comenzar con http:// o https://"}
    try:
        opened = webbrowser.open(url, new=2)
        if not opened:
            return {"ok": False, "error": "No se pudo abrir el navegador"}
        return {"ok": True, "error": None}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
