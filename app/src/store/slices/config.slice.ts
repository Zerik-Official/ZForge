import type { StateCreator } from "zustand";
import { settingsApi } from "@/services/api/domains/settings.api";
import type { AppConfig } from "@/types/domains/settings";
import type { Game } from "@/types/domains/game";

function resolveActiveId(games: Game[], config: AppConfig | null): string | null {
  if (games.length === 0) return null;
  if (config?.last_active_game) {
    const remembered = games.find((game) => game.id === config.last_active_game);
    if (remembered) return remembered.id;
  }
  const onMain = games.find((game) => game.show_on_main);
  return (onMain ?? games[0]).id;
}

export interface ConfigSlice {
  config: AppConfig | null;
  activeId: string | null;
  hydrated: boolean;
  setActive: (id: string) => Promise<void>;
}

export const createConfigSlice: StateCreator<ConfigSlice, [], [], ConfigSlice> = (set, get) => ({
  config: null,
  activeId: null,
  hydrated: false,

  async setActive(id) {
    const config = (get() as ConfigSlice).config ?? { theme: "dark", last_active_game: null, language: null };
    const next: AppConfig = { ...config, last_active_game: id };
    await settingsApi.saveAppConfig(next);
    set({ activeId: id, config: next } as Partial<ConfigSlice>);
  },
});

export { resolveActiveId };