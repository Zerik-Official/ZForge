export type AppLanguage = "en" | "es";

export interface AppConfig {
  theme: string;
  last_active_game: string | null;
  language: AppLanguage | null;
  discord_enabled: boolean;
  discord_auto_update: boolean;
  sdk_last_error: string | null;
  sdk_ever_installed?: boolean;
}

export interface GameSettings {
  launch_args: string;
  launch_priority: "normal" | "high" | "realtime";
  clear_cache_on_launch: boolean;
  realm_list: string;
  realm_name: string;
  refresh_rate: number;
  resolution: string;
  windowed: boolean;
  window_resize_lock: boolean;
  window_maximized: boolean;
  vsync: boolean;
  multisample: number;
  farclip: number;
  environment_detail: number;
  base_mip: number;
  shadow_level: number;
  ground_effect_density: number;
  texture_filtering_mode: number;
  ground_effect_dist: number;
  weather_density: number;
  ext_shadow_quality: number;
  component_texture_level: number;
  particle_density: number;
  specular: boolean;
  ffx_death: boolean;
  ffx_glow: boolean;
  projected_textures: boolean;
  sound_enable_all_sound: boolean;
  sound_enable_sfx: boolean;
  sound_enable_error_speech: boolean;
  sound_enable_emote_sounds: boolean;
  sound_enable_pet_sounds: boolean;
  sound_enable_music: boolean;
  sound_zone_music_no_delay: boolean;
  sound_enable_ambience: boolean;
  sound_enable_sound_when_game_is_in_bg: boolean;
  sound_enable_reverb: boolean;
  sound_enable_software_hrtf: boolean;
  sound_enable_dsp_effects: boolean;
  sound_listener_at_character: boolean;
  sound_output_quality: number;
  sound_output_driver_index: number;
  sound_num_channels: number;
  sound_enable_hardware: boolean;
  sound_master_volume: number;
  sound_sfx_volume: number;
  sound_music_volume: number;
  sound_ambience_volume: number;
}

export interface ConfigConflict {
  game_id: string;
  name: string;
  expansion: string;
  recommended: "db" | "game";
  db_settings: GameSettings;
  game_settings: GameSettings;
}