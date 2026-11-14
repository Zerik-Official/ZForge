import { call } from "../bridge";
import type { AppConfig, AudioDevice, DisplayResolution, GameSettings } from "@/types/domains/settings";
import type { SettingsSchema } from "@/types/domains/schema";

export class SettingsApi {
  getAppConfig(): Promise<AppConfig> {
    return call("get_app_config");
  }

  /** Apply a partial update; omitted fields keep their value, `null` clears nullable ones. */
  saveAppConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
    return call("save_app_config", { patch });
  }

  getDisplayResolution(): Promise<DisplayResolution> {
    return call("get_display_resolution");
  }

  /** Saved settings, or `null` when the game has none yet. */
  getGameSettings(gameId: string): Promise<GameSettings | null> {
    return call("get_game_settings", { gameId });
  }

  saveGameSettings(gameId: string, values: GameSettings): Promise<GameSettings> {
    return call("save_game_settings", { gameId, values });
  }

  scanGameConfig(gameId: string): Promise<GameSettings> {
    return call("scan_game_config", { gameId });
  }

  applyGameSettings(gameId: string): Promise<void> {
    return call("apply_game_settings", { gameId });
  }

  pullGameSettings(gameId: string): Promise<GameSettings> {
    return call("pull_game_settings", { gameId });
  }

  getSettingsSchema(versionId: string): Promise<SettingsSchema> {
    return call("get_settings_schema", { versionId });
  }

  listSettingsVersions(): Promise<string[]> {
    return call("list_settings_versions");
  }

  listAudioDevices(): Promise<AudioDevice[]> {
    return call("list_audio_devices");
  }
}

export const settingsApi = new SettingsApi();
