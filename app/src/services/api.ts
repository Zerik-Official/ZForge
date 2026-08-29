import type { ApiResult } from "@/types/pywebview";

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

// ---------------------------------------------------------------------------
// Internal bridge accessor — throws if called before ready
// ---------------------------------------------------------------------------

function bridge() {
  if (!_bridgeReady || !window.pywebview?.api) {
    throw new Error(
      "[api] Bridge is not ready. Await waitForBridge() before calling the API."
    );
  }
  return window.pywebview.api;
}

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

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

  /** Launch the WoW 3.3.5a client. */
  launchGame(): Promise<ApiResult> {
    return bridge().launch_game();
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
} as const;