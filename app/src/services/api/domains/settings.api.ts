import { bridge } from "../bridge";
import type { ApiResult, AppConfig, GameSettings } from "@/types/pywebview";
import type { SettingsSchema } from "@/types/domains/schema";

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

  getSettingsSchema(versionId: string): Promise<SettingsSchema> {
    return bridge().get_settings_schema(versionId);
  }

  listSettingsVersions(): Promise<string[]> {
    return bridge().list_settings_versions();
  }

  listAudioDevices(): Promise<{ index: number; name: string }[]> {
    return bridge().list_audio_devices();
  }
}

export const settingsApi = new SettingsApi();