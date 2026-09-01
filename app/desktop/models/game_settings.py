"""
Per-game launcher configuration model.

Holds every setting the launcher can manage for a single World of Warcraft
installation: launch behaviour, realm/server overrides and graphics options.
The data round-trips to JSON in the database and to the game's ``Config.wtf``
/ ``realmlist.wtf`` files.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any


@dataclass
class GameSettings:
    """All tunable settings for one saved game."""

    # ── Launch ─────────────────────────────────────────────────────────────
    launch_args: str = ""
    launch_priority: str = "normal"
    clear_cache_on_launch: bool = False

    # ── Server ────────────────────────────────────────────────────────────
    realm_list: str = ""
    realm_name: str = ""

    # ── Graphics ──────────────────────────────────────────────────────────
    refresh_rate: int = 60
    resolution: str = "1920x1080"
    windowed: bool = False
    window_resize_lock: bool = False
    window_maximized: bool = False
    vsync: bool = True
    multisample: int = 1

    # ── Effects ───────────────────────────────────────────────────────────
    farclip: int = 1277
    environment_detail: float = 1.5
    base_mip: int = 0
    shadow_level: int = 1
    ground_effect_density: int = 0
    texture_filtering_mode: int = 1
    ground_effect_dist: int = 140
    weather_density: int = 2
    ext_shadow_quality: int = 0
    component_texture_level: int = 0
    particle_density: float = 1.0
    specular: bool = False
    ffx_death: bool = True
    ffx_glow: bool = True
    projected_textures: bool = False

    # ── Sound ─────────────────────────────────────────────────────────────
    sound_enable_all_sound: bool = True
    sound_enable_sfx: bool = True
    sound_enable_error_speech: bool = True
    sound_enable_emote_sounds: bool = True
    sound_enable_pet_sounds: bool = True
    sound_enable_music: bool = True
    sound_zone_music_no_delay: bool = False
    sound_enable_ambience: bool = True
    sound_enable_sound_when_game_is_in_bg: bool = False
    sound_enable_reverb: bool = True
    sound_enable_software_hrtf: bool = False
    sound_enable_dsp_effects: bool = True
    sound_listener_at_character: bool = True
    sound_output_quality: int = 2
    sound_output_driver_index: int = 0
    sound_num_channels: int = 64
    sound_enable_hardware: bool = False
    sound_master_volume: float = 1.0
    sound_sfx_volume: float = 1.0
    sound_music_volume: float = 1.0
    sound_ambience_volume: float = 1.0

    def to_dict(self) -> dict[str, Any]:
        """Serialise the settings to a JSON-friendly dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "GameSettings":
        """Build a ``GameSettings`` from a dictionary, ignoring unknown keys."""
        known = {field for field in cls.__dataclass_fields__}
        return cls(**{key: value for key, value in data.items() if key in known})

    @classmethod
    def defaults(cls) -> "GameSettings":
        """Return a fresh instance with the built-in default values."""
        from desktop.utils import display

        width, height = display.get_primary_resolution()
        return cls(resolution=f"{width}x{height}")
