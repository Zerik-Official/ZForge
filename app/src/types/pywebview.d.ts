/**
 * Type declarations for the pywebview JS bridge.
 *
 * Every method here must have a matching counterpart in desktop/core/api.py.
 * The bridge is async by nature — all calls return Promises.
 */

/** Generic API response envelope returned by the backend. */
export interface ApiResult {
  ok: boolean;
  error: string | null;
}

/** A user-added World of Warcraft installation. */
export interface Game {
  id: string;
  name: string;
  expansion: string;
  exe_path: string;
  bg_video: string;
  icon: string;
  poster: string;
  box: string;
  show_on_main: boolean;
  created_at: string;
  sort_order: number;
}

/** Global launcher preferences persisted in config.json. */
export interface AppConfig {
  theme: string;
  last_active_game: string | null;
}

/** Per-game launcher configuration managed from the settings modal. */
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

/** Payload emitted on boot when a game's saved and actual config diverge. */
export interface ConfigConflict {
  game_id: string;
  name: string;
  expansion: string;
  recommended: "db" | "game";
  db_settings: GameSettings;
  game_settings: GameSettings;
}

/** Catalogue of bundled media the UI can offer when adding a game. */
export interface AssetManifest {
  expansions: Record<string, { name: string; video: string; poster: string; icon: string; box: string }>;
  available_videos: string[];
  available_posters: string[];
  available_icons: string[];
  available_boxes: string[];
}

/** A selectable server (or user-saved custom realmlist) in the realm picker. */
export interface ServerEntry {
  name: string;
  logo: string | null;
  realmlists: string[];
  realms: string[];
  website: string;
  custom: boolean;
}

/** A new or edited game before it receives a backend-generated id. */
export type GameInput = Omit<Game, "id" | "created_at" | "sort_order" | "box"> & Partial<Pick<Game, "sort_order" | "box">>;

declare global {
  interface Window {
    // ── pywebview bridge ──────────────────────────────────────────────────
    pywebview: {
      api: {
        // Health
        ping(): Promise<string>;

        // Window controls
        minimize_window(): Promise<void>;
        close_window(): Promise<void>;

        // Game
        launch_game(game_id: string): Promise<ApiResult>;
        install_client(): Promise<ApiResult>;
        repair_client(): Promise<ApiResult>;

        // Settings
        get_settings(): Promise<Record<string, unknown>>;
        save_settings(payload: Record<string, unknown>): Promise<ApiResult>;

        // Games
        list_games(): Promise<Game[]>;
        add_game(payload: GameInput): Promise<Game>;
        update_game(payload: Game): Promise<Game>;
        remove_game(id: string): Promise<ApiResult>;
        reorder_games(ordered_ids: string[]): Promise<ApiResult>;

        // Per-game settings
        get_game_settings(game_id: string): Promise<GameSettings>;
        save_game_settings(game_id: string, payload: GameSettings): Promise<ApiResult>;
        scan_game_config(game_id: string): Promise<GameSettings>;
        apply_game_settings(game_id: string): Promise<ApiResult>;
        pull_game_settings(game_id: string): Promise<ApiResult>;
        get_display_resolution(): Promise<{ width: number; height: number }>;

        // Application config
        get_app_config(): Promise<AppConfig>;
        save_app_config(payload: AppConfig): Promise<ApiResult>;

        // Asset pickers
        list_assets(): Promise<AssetManifest>;
        select_exe(): Promise<string | null>;
        select_custom_asset(kind: "icos" | "logos" | "scenes"): Promise<string | null>;

        // Server / realmlist catalogue
        list_servers(): Promise<ServerEntry[]>;
        save_custom_server(payload: { realmlist: string; name?: string; realm?: string }): Promise<ApiResult>;
        add_custom_realm(realmlist: string, realm: string): Promise<ApiResult>;
      };
    };
    
    __zforge_boot_message?: (message: string, percent: number) => void;
    __zforge_boot_done?: () => void;
    __zforge_config_conflict?: (conflict: ConfigConflict) => void;
  }
}

export {};