"""
Central error boundary for the desktop host.

Defines typed error codes, i18n key mapping and helpers to produce
sanitized API envelopes. The backend never sends raw human strings to the
frontend — it sends a stable ``code`` plus ``i18n_key`` and optional
``params`` so the frontend can translate.
"""

# Standard library
from __future__ import annotations

import functools
import traceback
from enum import StrEnum, unique
from typing import Any, Callable, Final

# Project imports
from desktop.utils.logger import Tags, log


@unique
class ErrorCode(StrEnum):
    """Stable error identifiers exposed to the frontend."""

    REALMLIST_EMPTY = "REALMLIST_EMPTY"
    URL_EMPTY = "URL_EMPTY"
    URL_PROTOCOL = "URL_PROTOCOL"
    BROWSER_OPEN_FAILED = "BROWSER_OPEN_FAILED"
    SDK_DOWNLOAD_IN_PROGRESS = "SDK_DOWNLOAD_IN_PROGRESS"
    SDK_FETCH_FAILED = "SDK_FETCH_FAILED"
    SDK_EXTRACTION_NOT_FOUND = "SDK_EXTRACTION_NOT_FOUND"
    SDK_INCOMPLETE = "SDK_INCOMPLETE"
    LICENSE_EMPTY = "LICENSE_EMPTY"
    GAME_NOT_FOUND = "GAME_NOT_FOUND"
    NO_SAVED_SETTINGS = "NO_SAVED_SETTINGS"
    SCHEMA_NOT_FOUND = "SCHEMA_NOT_FOUND"
    ORDERED_IDS_INVALID = "ORDERED_IDS_INVALID"
    EXECUTABLE_NOT_FOUND = "EXECUTABLE_NOT_FOUND"
    UNKNOWN = "UNKNOWN"


ERROR_I18N_KEYS: Final[dict[ErrorCode, str]] = {
    ErrorCode.REALMLIST_EMPTY: "errors.realmlistEmpty",
    ErrorCode.URL_EMPTY: "errors.urlEmpty",
    ErrorCode.URL_PROTOCOL: "errors.urlProtocol",
    ErrorCode.BROWSER_OPEN_FAILED: "errors.browserOpenFailed",
    ErrorCode.SDK_DOWNLOAD_IN_PROGRESS: "errors.sdkDownloadInProgress",
    ErrorCode.SDK_FETCH_FAILED: "errors.sdkFetchFailed",
    ErrorCode.SDK_EXTRACTION_NOT_FOUND: "errors.sdkExtractionNotFound",
    ErrorCode.SDK_INCOMPLETE: "errors.sdkIncomplete",
    ErrorCode.LICENSE_EMPTY: "errors.licenseEmpty",
    ErrorCode.GAME_NOT_FOUND: "errors.gameNotFound",
    ErrorCode.NO_SAVED_SETTINGS: "errors.noSavedSettings",
    ErrorCode.SCHEMA_NOT_FOUND: "errors.schemaNotFound",
    ErrorCode.ORDERED_IDS_INVALID: "errors.orderedIdsInvalid",
    ErrorCode.EXECUTABLE_NOT_FOUND: "errors.executableNotFound",
    ErrorCode.UNKNOWN: "errors.unknown",
}

ERROR_MESSAGES: Final[dict[ErrorCode, str]] = {
    ErrorCode.REALMLIST_EMPTY: "Realmlist cannot be empty",
    ErrorCode.URL_EMPTY: "URL cannot be empty",
    ErrorCode.URL_PROTOCOL: "URL must start with http:// or https://",
    ErrorCode.BROWSER_OPEN_FAILED: "Failed to open browser",
    ErrorCode.SDK_DOWNLOAD_IN_PROGRESS: "An SDK download is already in progress",
    ErrorCode.SDK_FETCH_FAILED: "Failed to fetch latest SDK version from GitHub",
    ErrorCode.SDK_EXTRACTION_NOT_FOUND: "Extracted SDK folder not found",
    ErrorCode.SDK_INCOMPLETE: "SDK incomplete after install",
    ErrorCode.LICENSE_EMPTY: "LICENSE is empty",
    ErrorCode.GAME_NOT_FOUND: "Game not found",
    ErrorCode.NO_SAVED_SETTINGS: "No saved settings for this game",
    ErrorCode.SCHEMA_NOT_FOUND: "Schema not found",
    ErrorCode.ORDERED_IDS_INVALID: "ordered_ids must be a list",
    ErrorCode.EXECUTABLE_NOT_FOUND: "Executable not found",
    ErrorCode.UNKNOWN: "An unknown error occurred",
}


class AppError(Exception):
    """Typed application error with i18n metadata."""

    def __init__(
        self,
        code: ErrorCode,
        params: dict[str, Any] | None = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(ERROR_MESSAGES.get(code, code.value))
        self.code: ErrorCode = code
        self.params: dict[str, Any] = params or {}
        self.cause: BaseException | None = cause

    @property
    def i18n_key(self) -> str:
        """Return the frontend translation key for this error."""
        return ERROR_I18N_KEYS.get(self.code, ERROR_I18N_KEYS[ErrorCode.UNKNOWN])


def make_error_envelope(
    code: ErrorCode,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Build a sanitized API error envelope.

    The envelope always contains a stable ``code`` and ``i18n_key`` so the
    frontend can translate. ``message`` is an English fallback for logs and
    backwards compatibility; frontend should prefer ``i18n_key``.

    Args:
        code: Stable error code.
        params: Interpolation variables for the i18n string (e.g. {"missing": "a, b"}).

    Returns:
        Dictionary with ``ok`` and ``error`` fields.
    """
    return {
        "ok": False,
        "error": {
            "code": code.value,
            "i18n_key": ERROR_I18N_KEYS.get(code, ERROR_I18N_KEYS[ErrorCode.UNKNOWN]),
            "params": params or {},
            "message": ERROR_MESSAGES.get(code, code.value),
        },
    }


def make_error_string_envelope(code: ErrorCode, params: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Build an envelope compatible with legacy ``{\"ok\": False, \"error\": str}`` callers.

    Keeps ``error`` as a plain string while also exposing ``code`` and
    ``i18n_key`` for new consumers.

    Args:
        code: Stable error code.
        params: Interpolation variables.

    Returns:
        Dictionary with ``ok``, ``error`` (string), ``code`` and ``i18n_key``.
    """
    envelope = make_error_envelope(code, params)
    err = envelope["error"]
    return {
        "ok": False,
        "error": err["message"],
        "code": err["code"],
        "i18n_key": err["i18n_key"],
        "params": err["params"],
    }


def handle_api_errors(func: Callable[..., Any]) -> Callable[..., Any]:
    """
    Decorator that sanitizes unhandled exceptions at the API boundary.

    Catches ``AppError`` and generic ``Exception``, logs the full traceback
    in English and returns a sanitized envelope without leaking internals.

    Args:
        func: API function to wrap.

    Returns:
        Wrapped function that never throws to the pywebview bridge.
    """

    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return func(*args, **kwargs)
        except AppError as exc:
            log("ERROR", Tags.API, f"{exc.code.value}: {exc} params={exc.params}")
            return make_error_string_envelope(exc.code, exc.params)
        except Exception as exc:
            log("ERROR", Tags.API, f"Unhandled {func.__name__}: {exc}\n{traceback.format_exc()}")
            return make_error_string_envelope(ErrorCode.UNKNOWN)

    return wrapper