/**
 * Type declarations for the pywebview JS bridge.
 *
 * Every method here must have a matching counterpart in backend/core/api.py.
 * The bridge is async by nature — all calls return Promises.
 */

/** Generic API response envelope returned by the backend. */
export interface ApiResult {
  ok: boolean;
  error: string | null;
}

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
        launch_game(): Promise<ApiResult>;
        install_client(): Promise<ApiResult>;
        repair_client(): Promise<ApiResult>;

        // Settings
        get_settings(): Promise<Record<string, unknown>>;
        save_settings(payload: Record<string, unknown>): Promise<ApiResult>;
      };
    };

    // ── Backend → frontend boot event handlers ────────────────────────────
    // Registered by useBootEvents; called by the backend via evaluate_js.
    __zforge_boot_message?: (message: string, percent: number) => void;
    __zforge_boot_done?: () => void;
  }
}

export {};