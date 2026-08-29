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
  show_on_main: boolean;
  created_at: string;
}

/** Global launcher preferences persisted in config.json. */
export interface AppConfig {
  theme: string;
  last_active_game: string | null;
}

/** Catalogue of bundled media the UI can offer when adding a game. */
export interface AssetManifest {
  expansions: Record<string, { name: string; video: string; poster: string; icon: string }>;
  available_videos: string[];
  available_posters: string[];
  available_icons: string[];
}

/** A new or edited game before it receives a backend-generated id. */
export type GameInput = Omit<Game, "id" | "created_at">;

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

        // Application config
        get_app_config(): Promise<AppConfig>;
        save_app_config(payload: AppConfig): Promise<ApiResult>;

        // Asset pickers
        list_assets(): Promise<AssetManifest>;
        select_exe(): Promise<string | null>;
        select_custom_asset(kind: "icos" | "logos" | "scenes"): Promise<string | null>;
      };
    };
    
    __zforge_boot_message?: (message: string, percent: number) => void;
    __zforge_boot_done?: () => void;
  }
}

export {};