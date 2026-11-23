import { call } from "../bridge";
import type { Addon, AddonAccount, AddonTarget } from "@/types/domains/addon";

export class AddonsApi {
  /** Accounts, realms and characters found in the game's `WTF` folder. */
  listAccounts(gameId: string): Promise<AddonAccount[]> {
    return call("list_addon_accounts", { gameId });
  }

  /** Installed addons; without a target, `enabled` is the `.toc` default. */
  listAddons(gameId: string, target: AddonTarget | null): Promise<Addon[]> {
    return call("list_addons", { gameId, target });
  }

  setEnabled(gameId: string, target: AddonTarget, folders: string[], enabled: boolean): Promise<void> {
    return call("set_addons_enabled", { gameId, target, folders, enabled });
  }

  /** Pick an addon zip and install it; `null` when the dialog was cancelled. */
  installAddons(gameId: string): Promise<string[] | null> {
    return call("install_addons", { gameId });
  }

  deleteAddon(gameId: string, folder: string): Promise<void> {
    return call("delete_addon", { gameId, folder });
  }

  openAddonsFolder(gameId: string): Promise<void> {
    return call("open_addons_folder", { gameId });
  }
}

export const addonsApi = new AddonsApi();
