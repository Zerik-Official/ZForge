"""
File system helpers.

Centralizes file operations for custom assets and related helpers.
"""

# Standard library
from __future__ import annotations

import shutil
from pathlib import Path

# Project imports
from desktop.utils.paths import custom_assets_kind_dir


def copy_custom_asset(kind: str, src_path: str) -> str:
    """
    Copy a user-selected asset into the app-data custom folder.

    Args:
        kind: One of ``icos``, ``logos``, ``scenes`` or ``boxes``.
        src_path: Absolute path of the file the user picked.

    Returns:
        Absolute destination path of the copied file (served as a ``file://``
        URL by the frontend).
    """
    src: Path = Path(src_path)
    dest_dir: Path = custom_assets_kind_dir(kind)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest: Path = dest_dir / src.name
    shutil.copy2(src, dest)
    return str(dest)