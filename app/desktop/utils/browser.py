"""
Browser helpers for opening external URLs.

Uses :mod:`webbrowser` to avoid native anchor tooltips and keep
navigation outside the pywebview context.
"""

# Standard library
from __future__ import annotations
import webbrowser

# Project imports
from desktop.core.errors import ErrorCode, handle_api_errors, make_error_string_envelope


@handle_api_errors
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
        return make_error_string_envelope(ErrorCode.URL_EMPTY)
    if not url.startswith(("http://", "https://")):
        return make_error_string_envelope(ErrorCode.URL_PROTOCOL)
    try:
        opened = webbrowser.open(url, new=2)
        if not opened:
            return make_error_string_envelope(ErrorCode.BROWSER_OPEN_FAILED)
        return {"ok": True, "error": None}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
