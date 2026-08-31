import { bridge } from "../bridge";
import type { ApiResult, AppConfig, GameSettings } from "@/types/pywebview";

export class SettingsApi {
  getSettings(): Promise<Record<string, unknown>> {
    return bridge().get_settings();
  }

  saveSettings(payload: Record<string, unknown>): Promise<ApiResult> {
    return bridge().save_settings(payload);
  }

  getAppConfig(): Promise<AppConfig> {
    return bridge().get_app_config();
  }

  saveAppConfig(payload: AppConfig): Promise<ApiResult> {
    return bridge().save_app_config(payload);
  }

  getDisplayResolution(): Promise<{ width: number; height: number }> {
    return bridge().get_display_resolution();
  }

  getGameSettings(gameId: string): Promise<GameSettings> {
    return bridge().get_game_settings(gameId);
  }

  saveGameSettings(gameId: string, payload: GameSettings): Promise<ApiResult> {
    return bridge().save_game_settings(gameId, payload);
  }

  scanGameConfig(gameId: string): Promise<GameSettings> {
    return bridge().scan_game_config(gameId);
  }

  applyGameSettings(gameId: string): Promise<ApiResult> {
    return bridge().apply_game_settings(gameId);
  }

  pullGameSettings(gameId: string): Promise<ApiResult> {
    return bridge().pull_game_settings(gameId);
  }
}

export const settingsApi = new SettingsApi();