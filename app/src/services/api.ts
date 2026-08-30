import type { ApiResult, Game, GameInput, AppConfig, AssetManifest, GameSettings } from "@/types/pywebview";

let _bridgeReady = false;

/**
 * Returns true only when `window.pywebview.api.ping` is a callable function.
 * This is stricter than just checking the object exists, which fixes the
 * intermittent "ping is not a function" race condition.
 */
function isBridgeCallable(): boolean {
  return typeof window.pywebview?.api?.ping === "function";
}

/**
 * Resolves when the pywebview bridge is fully callable.
 * Safe to call multiple times — resolves immediately after first success.
 */
export function waitForBridge(timeoutMs = 8_000): Promise<void> {
  if (_bridgeReady) return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (isBridgeCallable()) {
      _bridgeReady = true;
      resolve();
      return;
    }

    const POLL_MS = 50;
    let elapsed = 0;

    const timer = setInterval(() => {
      if (isBridgeCallable()) {
        clearInterval(timer);
        _bridgeReady = true;
        resolve();
        return;
      }

      elapsed += POLL_MS;
      if (elapsed >= timeoutMs) {
        clearInterval(timer);
        reject(
          new Error(
            `[api] pywebview bridge did not become ready within ${timeoutMs}ms.`
          )
        );
      }
    }, POLL_MS);
  });
}

function bridge() {
  if (!_bridgeReady || !window.pywebview?.api) {
    throw new Error(
      "[api] Bridge is not ready. Await waitForBridge() before calling the API."
    );
  }
  return window.pywebview.api;
}

export const api = {
  // ── Health ───────────────────────────────────────────────────────────────

  /** Verify the bridge is alive. Resolves to "pong". */
  ping(): Promise<string> {
    return bridge().ping();
  },

  // ── Window controls ──────────────────────────────────────────────────────

  /** Minimize the native window. */
  minimizeWindow(): Promise<void> {
    return bridge().minimize_window();
  },

  /** Close / destroy the native window and exit the app. */
  closeWindow(): Promise<void> {
    return bridge().close_window();
  },

  // ── Game ─────────────────────────────────────────────────────────────────

  /** Launch the WoW client for the given game id. */
  launchGame(gameId: string): Promise<ApiResult> {
    return bridge().launch_game(gameId);
  },

  /** Start the full client installation flow. */
  installClient(): Promise<ApiResult> {
    return bridge().install_client();
  },

  /** Start the client repair / integrity-check flow. */
  repairClient(): Promise<ApiResult> {
    return bridge().repair_client();
  },

  // ── Settings ─────────────────────────────────────────────────────────────

  /** Fetch current persisted settings. */
  getSettings(): Promise<Record<string, unknown>> {
    return bridge().get_settings();
  },

  /** Persist updated settings. */
  saveSettings(payload: Record<string, unknown>): Promise<ApiResult> {
    return bridge().save_settings(payload);
  },

  // ── Games ─────────────────────────────────────────────────────────────

  /** Fetch every saved game. */
  listGames(): Promise<Game[]> {
    return bridge().list_games();
  },

  /** Create a new game. */
  addGame(payload: GameInput): Promise<Game> {
    return bridge().add_game(payload);
  },

  /** Update an existing game. */
  updateGame(payload: Game): Promise<Game> {
    return bridge().update_game(payload);
  },

  /** Delete a game by id. */
  removeGame(id: string): Promise<ApiResult> {
    return bridge().remove_game(id);
  },

  // ── Per-game settings ─────────────────────────────────────────────────

  /** Fetch the saved settings for a game. */
  getGameSettings(gameId: string): Promise<GameSettings> {
    return bridge().get_game_settings(gameId);
  },

  /** Persist edited settings for a game. */
  saveGameSettings(gameId: string, payload: GameSettings): Promise<ApiResult> {
    return bridge().save_game_settings(gameId, payload);
  },

  /** Scan a game's client files and return the detected settings. */
  scanGameConfig(gameId: string): Promise<GameSettings> {
    return bridge().scan_game_config(gameId);
  },

  /** Write the saved settings into the game's configuration files. */
  applyGameSettings(gameId: string): Promise<ApiResult> {
    return bridge().apply_game_settings(gameId);
  },

  /** Overwrite the saved settings with the game's current files. */
  pullGameSettings(gameId: string): Promise<ApiResult> {
    return bridge().pull_game_settings(gameId);
  },

  /** Fetch the primary monitor's native resolution. */
  getDisplayResolution(): Promise<{ width: number; height: number }> {
    return bridge().get_display_resolution();
  },

  // ── Application config ───────────────────────────────────────────────

  /** Fetch global application settings. */
  getAppConfig(): Promise<AppConfig> {
    return bridge().get_app_config();
  },

  /** Persist global application settings. */
  saveAppConfig(payload: AppConfig): Promise<ApiResult> {
    return bridge().save_app_config(payload);
  },

  // ── Asset pickers ─────────────────────────────────────────────────────

  /** Fetch the bundled-asset catalogue. */
  listAssets(): Promise<AssetManifest> {
    return bridge().list_assets();
  },

  /** Open a native dialog to pick the WoW executable. */
  selectExe(): Promise<string | null> {
    return bridge().select_exe();
  },

  /** Pick and import a custom media file of the given kind. */
  selectCustomAsset(kind: "icos" | "logos" | "scenes"): Promise<string | null> {
    return bridge().select_custom_asset(kind);
  },
} as const;