import { healthApi } from "./api/domains/health.api";
import { windowApi } from "./api/domains/window.api";
import { gamesApi } from "./api/domains/games.api";
import { settingsApi } from "./api/domains/settings.api";
import { assetsApi } from "./api/domains/assets.api";
import { serversApi } from "./api/domains/servers.api";
import { sdkApi } from "./api/domains/sdk.api";

export { waitForBridge } from "./api/bridge";
export { healthApi } from "./api/domains/health.api";
export { windowApi } from "./api/domains/window.api";
export { gamesApi } from "./api/domains/games.api";
export { settingsApi } from "./api/domains/settings.api";
export { assetsApi } from "./api/domains/assets.api";
export { serversApi } from "./api/domains/servers.api";
export { sdkApi } from "./api/domains/sdk.api";

export const api = {
  ping: () => healthApi.ping(),
  minimizeWindow: () => windowApi.minimizeWindow(),
  closeWindow: () => windowApi.closeWindow(),
  launchGame: (gameId: string) => gamesApi.launchGame(gameId),
  installClient: () => gamesApi.installClient(),
  repairClient: () => gamesApi.repairClient(),
  getSettings: () => settingsApi.getSettings(),
  saveSettings: (payload: Record<string, unknown>) => settingsApi.saveSettings(payload),
  listGames: () => gamesApi.listGames(),
  addGame: (payload: import("@/types/pywebview").GameInput) => gamesApi.addGame(payload),
  updateGame: (payload: import("@/types/pywebview").Game) => gamesApi.updateGame(payload),
  removeGame: (id: string) => gamesApi.removeGame(id),
  reorderGames: (orderedIds: string[]) => gamesApi.reorderGames(orderedIds),
  getGameSettings: (gameId: string) => settingsApi.getGameSettings(gameId),
  saveGameSettings: (gameId: string, payload: import("@/types/pywebview").GameSettings) =>
    settingsApi.saveGameSettings(gameId, payload),
  scanGameConfig: (gameId: string) => settingsApi.scanGameConfig(gameId),
  applyGameSettings: (gameId: string) => settingsApi.applyGameSettings(gameId),
  pullGameSettings: (gameId: string) => settingsApi.pullGameSettings(gameId),
  getDisplayResolution: () => settingsApi.getDisplayResolution(),
  getSettingsSchema: (versionId: string) => settingsApi.getSettingsSchema(versionId),
  listSettingsVersions: () => settingsApi.listSettingsVersions(),
  listAudioDevices: () => settingsApi.listAudioDevices(),
  getAppConfig: () => settingsApi.getAppConfig(),
  saveAppConfig: (payload: import("@/types/pywebview").AppConfig) => settingsApi.saveAppConfig(payload),
  listAssets: () => assetsApi.listAssets(),
  selectExe: () => assetsApi.selectExe(),
  selectCustomAsset: (kind: "icos" | "logos" | "scenes") => assetsApi.selectCustomAsset(kind),
  listServers: () => serversApi.listServers(),
  saveCustomServer: (payload: { realmlist: string; name?: string; realm?: string }) =>
    serversApi.saveCustomServer(payload),
  addCustomRealm: (realmlist: string, realm: string) => serversApi.addCustomRealm(realmlist, realm),
  getSdkStatus: () => sdkApi.getSdkStatus(),
  installSdk: () => sdkApi.installSdk(),
  checkSdkUpdate: () => sdkApi.checkSdkUpdate(),
} as const;