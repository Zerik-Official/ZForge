"""
Per-game configuration: scan the installed client and apply saved settings.

The launcher keeps its own copy of every game's settings in the database.  On
boot we compare that copy against what the game files actually contain; when
they diverge we let the user decide which side wins.  These helpers bridge the
:class:`GameSettings` model and the game's ``Config.wtf`` / ``realmlist.wtf``.
"""

# Standard library
from __future__ import annotations

from pathlib import Path
from typing import Any

# Project imports
from desktop.models.game_settings import GameSettings
from desktop.services.config import wtf
from desktop.utils import display
from desktop.utils.logger import log, Tags


def scan_game_config(exe_path: str) -> dict[str, Any]:
    """
    Read the current client configuration from disk into a settings dict.

    Only the fields backed by game files (server + graphics) are populated;
    pure launcher options keep their defaults.

    Args:
        exe_path: Absolute path of the game executable.

    Returns:
        Serialised :class:`GameSettings` dictionary.
    """
    root = Path(exe_path).parent
    config_path = root / "WTF" / "Config.wtf"
    parsed = wtf.parse_config_wtf(config_path)

    def read(key: str, default: str) -> str:
        return wtf.get_config_value(parsed, key, default)

    def to_int(key: str, default: int) -> int:
        raw = read(key, str(default))
        try:
            return int(raw)
        except ValueError:
            return default

    def to_float(key: str, default: float) -> float:
        raw = read(key, str(default))
        try:
            return float(raw)
        except ValueError:
            return default

    max_w, max_h = display.get_primary_resolution()

    settings = GameSettings(
        realm_list=read("realmList", ""),
        realm_name=read("realmName", ""),
        refresh_rate=to_int("gxRefresh", 60),
        resolution=read("gxResolution", f"{max_w}x{max_h}"),
        windowed=read("gxWindow", "0") == "1",
        window_resize_lock=read("windowResizeLock", "0") == "1",
        window_maximized=read("gxMaximize", "0") == "1",
        vsync=read("gxVSync", "1") != "0",
        multisample=to_int("gxMultisample", 1),
        farclip=to_int("farclip", 1277),
        environment_detail=to_float("environmentDetail", 1.5),
        base_mip=1 if read("baseMip", "") == "1" else 0,
        shadow_level=0 if read("shadowLevel", "1") == "0" else 1,
        ground_effect_density=to_int("groundEffectDensity", 0),
        texture_filtering_mode=to_int("textureFilteringMode", 1),
        ground_effect_dist=to_int("groundEffectDist", 140),
        weather_density=to_int("weatherDensity", 2),
        ext_shadow_quality=to_int("extShadowQuality", 0),
        component_texture_level=9 if read("componentTextureLevel", "") == "9" else 0,
        particle_density=to_float("particleDensity", 1.0),
        specular=read("specular", "0") == "1",
        ffx_death=read("ffxDeath", "1") != "0",
        ffx_glow=read("ffxGlow", "1") != "0",
        projected_textures=read("projectedTextures", "0") == "1",
        sound_enable_all_sound=read("Sound_EnableAllSound", "1") == "1",
        sound_enable_sfx=read("Sound_EnableSFX", "1") == "1",
        sound_enable_error_speech=read("Sound_EnableErrorSpeech", "1") == "1",
        sound_enable_emote_sounds=read("Sound_EnableEmoteSounds", "1") == "1",
        sound_enable_pet_sounds=read("Sound_EnablePetSounds", "1") == "1",
        sound_enable_music=read("Sound_EnableMusic", "1") == "1",
        sound_zone_music_no_delay=read("Sound_ZoneMusicNoDelay", "0") == "1",
        sound_enable_ambience=read("Sound_EnableAmbience", "1") == "1",
        sound_enable_sound_when_game_is_in_bg=read("Sound_EnableSoundWhenGameIsInBG", "0") == "1",
        sound_enable_reverb=read("Sound_EnableReverb", "1") == "1",
        sound_enable_software_hrtf=read("Sound_EnableSoftwareHRTF", "0") == "1",
        sound_enable_dsp_effects=read("Sound_EnableDSPEffects", "1") == "1",
        sound_listener_at_character=read("Sound_ListenerAtCharacter", "1") == "1",
        sound_output_quality=to_int("Sound_OutputQuality", 2),
        sound_output_driver_index=to_int("Sound_OutputDriverIndex", 0),
        sound_num_channels=to_int("Sound_NumChannels", 64),
        sound_enable_hardware=read("Sound_EnableHardware", "0") == "1",
        sound_master_volume=to_float("Sound_MasterVolume", 1.0),
        sound_sfx_volume=to_float("Sound_SFXVolume", 1.0),
        sound_music_volume=to_float("Sound_MusicVolume", 1.0),
        sound_ambience_volume=to_float("Sound_AmbienceVolume", 1.0),
    )
    log("DEBUG", Tags.SETTINGS, f"Scanned config for {exe_path}")
    return settings.to_dict()


def apply_game_settings(settings: dict[str, Any], exe_path: str) -> None:
    """
    Push saved settings into the game's ``Config.wtf`` and ``realmlist.wtf``.

    Args:
        settings: Serialised :class:`GameSettings` dictionary.
        exe_path: Absolute path of the game executable.
    """
    root = Path(exe_path).parent
    config_path = root / "WTF" / "Config.wtf"

    windowed = bool(settings.get("windowed", False))
    vsync = bool(settings.get("vsync", True))
    multisample = int(settings.get("multisample", 1))
    texture_filtering_mode = int(settings.get("texture_filtering_mode", 1))
    weather_density = int(settings.get("weather_density", 2))
    ground_effect_density = int(settings.get("ground_effect_density", 0))
    ext_shadow_quality = int(settings.get("ext_shadow_quality", 0))
    component_texture_level = int(settings.get("component_texture_level", 0))
    base_mip = int(settings.get("base_mip", 0))
    shadow_level = int(settings.get("shadow_level", 1))

    config_updates: dict[str, str | None] = {
        "realmList": settings.get("realm_list") or None,
        "realmName": settings.get("realm_name") or None,
        "gxRefresh": str(settings.get("refresh_rate", 60)),
        "gxResolution": settings.get("resolution", "1920x1080"),
        "gxWindow": "1" if windowed else None,
        "windowResizeLock": "1" if settings.get("window_resize_lock", False) else None,
        "gxMaximize": "1" if settings.get("window_maximized", False) else None,
        "gxVSync": "0" if not vsync else None,
        "gxMultisample": str(multisample) if multisample != 1 else None,
        "specular": "1" if settings.get("specular", False) else None,
        "ffxDeath": "0" if not settings.get("ffx_death", True) else None,
        "ffxGlow": "0" if not settings.get("ffx_glow", True) else None,
        "projectedTextures": "1" if settings.get("projected_textures", False) else None,
        "farclip": str(int(settings.get("farclip", 1277))),
        "environmentDetail": str(float(settings.get("environment_detail", 1.5))),
        "baseMip": "1" if base_mip == 1 else None,
        "shadowLevel": "0" if shadow_level == 0 else None,
        "groundEffectDensity": str(ground_effect_density) if ground_effect_density != 0 else None,
        "textureFilteringMode": None if texture_filtering_mode == 1 else str(texture_filtering_mode),
        "groundEffectDist": str(int(settings.get("ground_effect_dist", 140))),
        "weatherDensity": None if weather_density == 2 else str(weather_density),
        "extShadowQuality": str(ext_shadow_quality) if ext_shadow_quality != 0 else None,
        "componentTextureLevel": "9" if component_texture_level == 9 else None,
        "particleDensity": str(float(settings.get("particle_density", 1.0))),
        "Sound_EnableAllSound": "1" if settings.get("sound_enable_all_sound", True) else "0",
        "Sound_EnableSFX": "1" if settings.get("sound_enable_sfx", True) else "0",
        "Sound_EnableErrorSpeech": "1" if settings.get("sound_enable_error_speech", True) else "0",
        "Sound_EnableEmoteSounds": "1" if settings.get("sound_enable_emote_sounds", True) else "0",
        "Sound_EnablePetSounds": "1" if settings.get("sound_enable_pet_sounds", True) else "0",
        "Sound_EnableMusic": "1" if settings.get("sound_enable_music", True) else "0",
        "Sound_ZoneMusicNoDelay": "1" if settings.get("sound_zone_music_no_delay", False) else "0",
        "Sound_EnableAmbience": "1" if settings.get("sound_enable_ambience", True) else "0",
        "Sound_EnableSoundWhenGameIsInBG": "1" if settings.get("sound_enable_sound_when_game_is_in_bg", False) else "0",
        "Sound_EnableReverb": "1" if settings.get("sound_enable_reverb", True) else "0",
        "Sound_EnableSoftwareHRTF": "1" if settings.get("sound_enable_software_hrtf", False) else "0",
        "Sound_EnableDSPEffects": "1" if settings.get("sound_enable_dsp_effects", True) else "0",
        "Sound_ListenerAtCharacter": "1" if settings.get("sound_listener_at_character", True) else "0",
        "Sound_OutputQuality": str(int(settings.get("sound_output_quality", 2))),
        "Sound_OutputDriverIndex": str(int(settings.get("sound_output_driver_index", 0))),
        "Sound_NumChannels": str(int(settings.get("sound_num_channels", 64))),
        "Sound_EnableHardware": "1" if settings.get("sound_enable_hardware", False) else "0",
        "Sound_MasterVolume": str(float(settings.get("sound_master_volume", 1.0))),
        "Sound_SFXVolume": str(float(settings.get("sound_sfx_volume", 1.0))),
        "Sound_MusicVolume": str(float(settings.get("sound_music_volume", 1.0))),
        "Sound_AmbienceVolume": str(float(settings.get("sound_ambience_volume", 1.0))),
    }
    wtf.write_config_wtf(config_path, config_updates)

    realm_list = settings.get("realm_list", "")
    if realm_list:
        data_dir = root / "Data"
        if data_dir.exists():
            for lang_dir in sorted(data_dir.iterdir()):
                if lang_dir.is_dir():
                    wtf.set_realmlist_value(lang_dir / "realmlist.wtf", realm_list)

    log("INFO", Tags.SETTINGS, f"Applied settings to game at {exe_path}")


def config_file_fingerprint(settings: dict[str, Any]) -> dict[str, Any]:
    """
    Extract only the fields that are reflected in game files.

    Used to compare the database copy against a fresh scan without being thrown
    off by launcher-only options (launch args, priority, cache clearing).

    Args:
        settings: Serialised :class:`GameSettings` dictionary.

    Returns:
        Subset dictionary containing the comparable keys.
    """
    keys = [
        "realm_list",
        "realm_name",
        "refresh_rate",
        "resolution",
        "windowed",
        "window_resize_lock",
        "window_maximized",
        "vsync",
        "multisample",
        "farclip",
        "environment_detail",
        "base_mip",
        "shadow_level",
        "ground_effect_density",
        "texture_filtering_mode",
        "ground_effect_dist",
        "weather_density",
        "ext_shadow_quality",
        "component_texture_level",
        "particle_density",
        "specular",
        "ffx_death",
        "ffx_glow",
        "projected_textures",
        "sound_enable_all_sound",
        "sound_enable_sfx",
        "sound_enable_error_speech",
        "sound_enable_emote_sounds",
        "sound_enable_pet_sounds",
        "sound_enable_music",
        "sound_zone_music_no_delay",
        "sound_enable_ambience",
        "sound_enable_sound_when_game_is_in_bg",
        "sound_enable_reverb",
        "sound_enable_software_hrtf",
        "sound_enable_dsp_effects",
        "sound_listener_at_character",
        "sound_output_quality",
        "sound_output_driver_index",
        "sound_num_channels",
        "sound_enable_hardware",
        "sound_master_volume",
        "sound_sfx_volume",
        "sound_music_volume",
        "sound_ambience_volume",
    ]
    return {key: settings.get(key) for key in keys}
