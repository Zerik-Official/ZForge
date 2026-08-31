export interface AppConfig {
  theme: string;
  last_active_game: string | null;
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
}

export interface ConfigConflict {
  game_id: string;
  name: string;
  expansion: string;
  recommended: "db" | "game";
  db_settings: GameSettings;
  game_settings: GameSettings;
}