"""
SDK download and installation.

Handles fetching the latest release zip from GitHub, streaming with
progress reporting, extracting to ``%APPDATA%/ZForge/tools`` and cleaning
unneeded files.
"""

# Standard library
from __future__ import annotations

import shutil
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Callable

# Project imports
from desktop.constants import SDK_EXPECTED_PREFIX
from desktop.services.sdk.validation import find_installed_sdk, is_sdk_valid, missing_files
from desktop.services.sdk.version import fetch_latest_release
from desktop.storage import config as config_store
from desktop.utils.logger import Tags, log
from desktop.utils.paths import tools_dir
from desktop.services.sdk.validation import find_installed_sdk, get_sdk_status
from desktop.services.sdk.version import fetch_latest_release as _fetch
from desktop.services.sdk.version import is_version_greater

ProgressCallback = Callable[[dict[str, Any]], None]

_is_downloading = False


def _download_file(url: str, dest: Path, on_progress: ProgressCallback | None) -> None:
    """
    Stream a file from ``url`` to ``dest`` with optional progress callback.

    Args:
        url: Remote URL to download.
        dest: Local file path to write.
        on_progress: Callback receiving ``{downloaded, total, percent, speed, eta}``.
    """
    req = urllib.request.Request(url, headers={"User-Agent": "ZForge"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        total = int(resp.headers.get("Content-Length") or 0)
        downloaded = 0
        start = time.time()
        chunk_size = 64 * 1024
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as out:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                out.write(chunk)
                downloaded += len(chunk)
                if on_progress and total:
                    elapsed = max(0.001, time.time() - start)
                    speed = downloaded / elapsed
                    percent = int(downloaded * 100 / total) if total else 0
                    remaining = (total - downloaded) / speed if speed > 0 else 0
                    on_progress(
                        {
                            "downloaded": downloaded,
                            "total": total,
                            "percent": min(100, percent),
                            "speed": speed,
                            "eta": remaining,
                        }
                    )
        if on_progress:
            on_progress({"downloaded": downloaded, "total": total or downloaded, "percent": 100, "speed": 0, "eta": 0})


def download_and_install(on_progress: ProgressCallback | None = None) -> dict[str, Any]:
    """
    Download the latest SDK release and install it.

    Fetches the latest GitHub release, streams the zip with progress,
    extracts to ``tools/`` and removes ``wowsdk_cli.py`` / ``requirements.txt``.

    Args:
        on_progress: Optional callback for download progress.

    Returns:
        Result dictionary with ``ok``, ``error``, ``version`` and ``path``.
    """
    global _is_downloading
    if _is_downloading:
        return {"ok": False, "error": "Ya hay una descarga del SDK en progreso."}
    _is_downloading = True
    try:
        return _download_and_install_inner(on_progress)
    finally:
        _is_downloading = False


def _download_and_install_inner(on_progress: ProgressCallback | None) -> dict[str, Any]:
    latest = fetch_latest_release()
    if not latest:
        return {"ok": False, "error": "No se pudo obtener la última versión del SDK desde GitHub."}

    url = str(latest["browser_download_url"])
    version = str(latest["version"]).lstrip("v")
    folder_name = f"{SDK_EXPECTED_PREFIX}v{version}"
    dest_dir = tools_dir() / folder_name

    tmp_zip: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
            tmp_zip = Path(tmp.name)

        log("INFO", Tags.API, f"Downloading SDK {version} from {url}")

        def progress_cb(info: dict[str, Any]) -> None:
            if on_progress:
                on_progress(info)
            try:
                from desktop.core.events import emitter

                emitter.emit(
                    "sdk_download_progress",
                    {
                        "percent": int(info.get("percent", 0)),
                        "downloaded": int(info.get("downloaded", 0)),
                        "total": int(info.get("total", 0)),
                        "speed": float(info.get("speed", 0)),
                        "eta": float(info.get("eta", 0)),
                        "version": version,
                    },
                )
                if info.get("total"):
                    emitter.boot_message(f"Descargando SDK v{version}… {info.get('percent')} %", 55)
            except Exception:
                pass

        _download_file(url, tmp_zip, progress_cb)

        if dest_dir.exists():
            shutil.rmtree(dest_dir, ignore_errors=True)
        if tools_dir().exists():
            for child in tools_dir().iterdir():
                if child.is_dir() and child.name.startswith(SDK_EXPECTED_PREFIX) and child != dest_dir:
                    shutil.rmtree(child, ignore_errors=True)

        tools_dir().mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(tmp_zip, "r") as zf:
            zf.extractall(tools_dir())

        extracted = tools_dir() / folder_name
        if not extracted.exists():
            found: Path | None = None
            if tools_dir().exists():
                for child in tools_dir().iterdir():
                    if child.is_dir() and child.name.startswith(SDK_EXPECTED_PREFIX):
                        found = child
                        break
            if found:
                extracted = found
            else:
                return {"ok": False, "error": "No se encontró la carpeta extraída del SDK."}

        for name in ("wowsdk_cli.py", "requirements.txt"):
            p = extracted / name
            if p.exists():
                try:
                    p.unlink()
                except OSError:
                    pass

        if not is_sdk_valid(extracted):
            missing = missing_files(extracted)
            return {"ok": False, "error": f"SDK incompleto tras instalar. Faltan: {', '.join(missing)}"}

        settings = config_store.load_app_config()
        settings.sdk_last_error = None
        config_store.save_app_config(settings)

        log("SUCCESS", Tags.API, f"SDK v{version} instalado en {extracted}")
        return {"ok": True, "error": None, "version": version, "path": str(extracted)}

    except Exception as exc:
        log("ERROR", Tags.API, f"download_and_install failed: {exc}")
        return {"ok": False, "error": str(exc)}
    finally:
        if tmp_zip and tmp_zip.exists():
            try:
                tmp_zip.unlink()
            except OSError:
                pass


def check_and_repair_on_boot() -> dict[str, Any] | None:
    """
    Check SDK health at boot and handle repair / auto-update.

    Args:
        None
    Returns:
        Download result when an update/repair was performed, else ``None``.
    """

    status = get_sdk_status()
    app_settings = config_store.load_app_config()

    if status["needs_repair"] or status["needs_install"]:
        settings = config_store.load_app_config()
        msg = "En la última comprobación, se detectó una corrupción en el SDK o este fue eliminado."
        settings.sdk_last_error = msg
        config_store.save_app_config(settings)
        log("WARNING", Tags.API, f"SDK needs repair/install: {status}")
        if not app_settings.discord_enabled:
            log("INFO", Tags.API, "SDK repair skipped — Discord Rich Presence is disabled")
            return None
        log("INFO", Tags.API, "SDK repair triggered — downloading...")
        result = download_and_install()
        if not result.get("ok"):
            settings = config_store.load_app_config()
            settings.sdk_last_error = str(result.get("error"))
            config_store.save_app_config(settings)
        return result

    if not app_settings.discord_enabled:
        log("INFO", Tags.API, "SDK auto-update skipped — Discord Rich Presence is disabled")
        return None
    if not app_settings.discord_auto_update:
        return None

    latest = _fetch()
    if not latest:
        return None

    _, local_version = find_installed_sdk()
    remote_version = str(latest.get("version") or "")
    if not remote_version:
        return None
    if local_version and not is_version_greater(remote_version, local_version):
        return None

    log("INFO", Tags.API, f"SDK update available {local_version} -> {remote_version}, downloading...")
    try:
        from desktop.core.events import emitter

        emitter.boot_message(f"Actualizando SDK v{remote_version}…", 50)
    except Exception:
        pass

    result = download_and_install()
    if not result.get("ok"):
        settings = config_store.load_app_config()
        settings.sdk_last_error = str(result.get("error"))
        config_store.save_app_config(settings)
    return result