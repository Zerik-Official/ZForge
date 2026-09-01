import type { Game, GameInput } from "./domains/game";
import type { AppConfig, GameSettings, ConfigConflict } from "./domains/settings";
import type { AssetManifest } from "./domains/assets";
import type { ServerEntry } from "./domains/server";
import type { ApiResult } from "./domains/api";
import type { SettingsSchema } from "./domains/schema";

export type { Game, GameInput, AppConfig, GameSettings, ConfigConflict, AssetManifest, ServerEntry, ApiResult, SettingsSchema };

declare global {
  interface Window {
    pywebview: {
      api: {
        ping(): Promise<string>;
        minimize_window(): Promise<void>;
        close_window(): Promise<void>;
        launch_game(game_id: string): Promise<ApiResult>;
        install_client(): Promise<ApiResult>;
        repair_client(): Promise<ApiResult>;
        get_settings(): Promise<Record<string, unknown>>;
        save_settings(payload: Record<string, unknown>): Promise<ApiResult>;
        list_games(): Promise<Game[]>;
        add_game(payload: GameInput): Promise<Game>;
        update_game(payload: Game): Promise<Game>;
        remove_game(id: string): Promise<ApiResult>;
        reorder_games(ordered_ids: string[]): Promise<ApiResult>;
        get_game_settings(game_id: string): Promise<GameSettings>;
        save_game_settings(game_id: string, payload: GameSettings): Promise<ApiResult>;
        scan_game_config(game_id: string): Promise<GameSettings>;
        apply_game_settings(game_id: string): Promise<ApiResult>;
        pull_game_settings(game_id: string): Promise<ApiResult>;
        get_display_resolution(): Promise<{ width: number; height: number }>;
        get_app_config(): Promise<AppConfig>;
        save_app_config(payload: AppConfig): Promise<ApiResult>;
        list_assets(): Promise<AssetManifest>;
        select_exe(): Promise<string | null>;
        select_custom_asset(kind: "icos" | "logos" | "scenes"): Promise<string | null>;
        list_servers(): Promise<ServerEntry[]>;
        save_custom_server(payload: { realmlist: string; name?: string; realm?: string }): Promise<ApiResult>;
        add_custom_realm(realmlist: string, realm: string): Promise<ApiResult>;
        get_settings_schema(version_id: string): Promise<SettingsSchema>;
        list_settings_versions(): Promise<string[]>;
      };
    };
    __zforge_boot_message?: (message: string, percent: number) => void;
    __zforge_boot_done?: () => void;
    __zforge_config_conflict?: (conflict: ConfigConflict) => void;
  }
}

export {};