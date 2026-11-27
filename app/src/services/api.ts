import { windowApi } from "./api/domains/window.api";
import { gamesApi } from "./api/domains/games.api";
import { settingsApi } from "./api/domains/settings.api";
import { assetsApi } from "./api/domains/assets.api";
import { serversApi } from "./api/domains/servers.api";
import { sdkApi } from "./api/domains/sdk.api";
import { bootApi } from "./api/domains/boot.api";
import { sessionApi } from "./api/domains/session.api";
import type { AppConfig, GameSettings } from "@/types/domains/settings";
import type { Game, GameDraft } from "@/types/domains/game";
import type { CustomAssetKind } from "@/types/domains/assets";
import type { CustomServerInput } from "@/types/domains/server";
import type { LaunchChoice } from "@/types/domains/accounts";

export { errorCode, isApiError, type ApiError } from "./api/bridge";
export { windowApi } from "./api/domains/window.api";
export { gamesApi } from "./api/domains/games.api";
export { settingsApi } from "./api/domains/settings.api";
export { assetsApi } from "./api/domains/assets.api";
export { serversApi } from "./api/domains/servers.api";
export { sdkApi } from "./api/domains/sdk.api";
export { bootApi } from "./api/domains/boot.api";
export { sessionApi } from "./api/domains/session.api";
export { presenceApi } from "./api/domains/presence.api";
export { trayApi } from "./api/domains/tray.api";
export { notificationsApi } from "./api/domains/notifications.api";
export { accountsApi } from "./api/domains/accounts.api";
export { themesApi } from "./api/domains/themes.api";
export { addonsApi } from "./api/domains/addons.api";
export { systemApi } from "./api/domains/system.api";

export const api = {
  minimizeWindow: () => windowApi.minimizeWindow(),
  closeWindow: () => windowApi.closeWindow(),
  runBoot: () => bootApi.runBoot(),
  launchGame: (gameId: string, choice?: LaunchChoice) => sessionApi.launchGame(gameId, choice),
  getSession: () => sessionApi.getSession(),
  listGames: () => gamesApi.listGames(),
  addGame: (draft: GameDraft) => gamesApi.addGame(draft),
  updateGame: (game: Game) => gamesApi.updateGame(game),
  removeGame: (id: string) => gamesApi.removeGame(id),
  reorderGames: (orderedIds: string[]) => gamesApi.reorderGames(orderedIds),
  getGameSettings: (gameId: string) => settingsApi.getGameSettings(gameId),
  saveGameSettings: (gameId: string, values: GameSettings) => settingsApi.saveGameSettings(gameId, values),
  scanGameConfig: (gameId: string) => settingsApi.scanGameConfig(gameId),
  applyGameSettings: (gameId: string) => settingsApi.applyGameSettings(gameId),
  pullGameSettings: (gameId: string) => settingsApi.pullGameSettings(gameId),
  getDisplayResolution: () => settingsApi.getDisplayResolution(),
  getSettingsSchema: (versionId: string) => settingsApi.getSettingsSchema(versionId),
  listSettingsVersions: () => settingsApi.listSettingsVersions(),
  listAudioDevices: () => settingsApi.listAudioDevices(),
  getAppConfig: () => settingsApi.getAppConfig(),
  saveAppConfig: (patch: Partial<AppConfig>) => settingsApi.saveAppConfig(patch),
  listAssets: () => assetsApi.listAssets(),
  selectExe: () => assetsApi.selectExe(),
  selectCustomAsset: (kind: CustomAssetKind) => assetsApi.selectCustomAsset(kind),
  listServers: () => serversApi.listServers(),
  saveCustomServer: (server: CustomServerInput) => serversApi.saveCustomServer(server),
  addCustomRealm: (realmlist: string, realm: string) => serversApi.addCustomRealm(realmlist, realm),
  getSdkStatus: () => sdkApi.getSdkStatus(),
  installSdk: () => sdkApi.installSdk(),
  checkSdkUpdate: () => sdkApi.checkSdkUpdate(),
  getSdkLicense: () => sdkApi.getSdkLicense(),
  openExternalUrl: (url: string) => sdkApi.openExternalUrl(url),
} as const;
