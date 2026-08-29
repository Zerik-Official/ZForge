"""
Central application configuration.
Reads environment variables from .env via os.environ.
"""

# Standard library
import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class AppConfig:
    """Immutable application configuration resolved at startup."""

    app_name: str        = field(default_factory=lambda: os.getenv("APP_NAME", "ZForge"))
    debug: bool          = field(default_factory=lambda: os.getenv("DEBUG", "false").lower() == "true")
    discord_client_id: str = field(default_factory=lambda: os.getenv("DISCORD_CLIENT_ID", ""))

    # Window
    width: int   = 1208
    height: int  = 722
    resizable: bool = False
    frameless: bool = True
    easy_drag: bool = False
    background_color: str = "#07070b"

    # Dev server
    dev_url: str = "http://localhost:5173"

    # Production build (relative to project root)
    build_dir: str = "dist"
    build_entry: str = "index.html"


# Singleton — import this everywhere.
config = AppConfig()