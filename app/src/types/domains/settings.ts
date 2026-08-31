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
}

export interface ConfigConflict {
  game_id: string;
  name: string;
  expansion: string;
  recommended: "db" | "game";
  db_settings: GameSettings;
  game_settings: GameSettings;
}