import { call } from "../bridge";
import type { BuildInfo, ShortcutAction } from "@/types/domains/system";

export class SystemApi {
  /** Version and commit of the running launcher. */
  getBuildInfo(): Promise<BuildInfo> {
    return call("get_build_info");
  }

  /** Whether Windows starts the launcher at sign-in. */
  getAutostart(): Promise<boolean> {
    return call("get_autostart");
  }

  /** Turn starting with Windows on or off; resolves with the resulting state. */
  setAutostart(enabled: boolean): Promise<boolean> {
    return call("set_autostart", { enabled });
  }

  /** The shortcut action the launcher was started with, handed out once. */
  takeShortcutAction(): Promise<ShortcutAction | null> {
    return call("take_shortcut_action");
  }

  /** Create the desktop shortcut of a game; resolves with the shortcut path. */
  createGameShortcut(action: ShortcutAction): Promise<string> {
    return call("create_game_shortcut", { action });
  }
}

export const systemApi = new SystemApi();
