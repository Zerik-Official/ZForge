import { create } from "zustand";
import { gamesApi } from "@/services/api/domains/games.api";
import { assetsApi } from "@/services/api/domains/assets.api";
import { settingsApi } from "@/services/api/domains/settings.api";
import type { Game, GameDraft } from "@/types/domains/game";
import type { AppConfig } from "@/types/domains/settings";
import type { AssetManifest } from "@/types/domains/assets";

function resolveActiveId(games: Game[], config: AppConfig | null): string | null {
  if (games.length === 0) return null;
  if (config?.last_active_game) {
    const remembered = games.find((game) => game.id === config.last_active_game);
    if (remembered) return remembered.id;
  }
  const onMain = games.find((game) => game.show_on_main);
  return (onMain ?? games[0]).id;
}

interface GamesState {
  games: Game[];
  activeId: string | null;
  assets: AssetManifest | null;
  config: AppConfig | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addGame: (payload: GameDraft) => Promise<Game>;
  updateGame: (game: Game) => Promise<Game>;
  removeGame: (id: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
  reorderDock: (orderedIds: string[]) => Promise<void>;
  /** Save launcher preferences and keep the copy in the store current. */
  saveConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>;
}

export const useGamesStore = create<GamesState>((set, get) => ({
  games: [],
  activeId: null,
  assets: null,
  config: null,
  hydrated: false,

  async hydrate() {
    const [games, assets, config] = await Promise.all([
      gamesApi.listGames(),
      assetsApi.listAssets(),
      settingsApi.getAppConfig(),
    ]);
    set({ games, assets, config, hydrated: true, activeId: resolveActiveId(games, config) });
  },

  async addGame(payload) {
    const game = await gamesApi.addGame(payload);
    set((state) => ({
      games: [...state.games, game],
      activeId: state.activeId ?? game.id,
    }));
    return game;
  },

  async updateGame(game) {
    const updated = await gamesApi.updateGame(game);
    set((state) => ({
      games: state.games.map((item) => (item.id === updated.id ? updated : item)),
    }));
    return updated;
  },

  async removeGame(id) {
    await gamesApi.removeGame(id);
    set((state) => {
      const games = state.games.filter((item) => item.id !== id);
      const activeId = state.activeId === id ? resolveActiveId(games, state.config) : state.activeId;
      return { games, activeId };
    });
  },

  async setActive(id) {
    const config = await settingsApi.saveAppConfig({ last_active_game: id });
    set({ activeId: id, config });
  },

  async saveConfig(patch) {
    const config = await settingsApi.saveAppConfig(patch);
    set({ config });
    return config;
  },

  async reorderDock(orderedIds) {
    const { games } = get();
    const dock = games.filter((g) => g.show_on_main);
    if (orderedIds.length !== dock.length) return;
    const orderedDock = orderedIds.map((id) => games.find((g) => g.id === id)!).filter(Boolean) as typeof games;
    if (orderedDock.length !== dock.length) return;
    const dockPositions: number[] = [];
    games.forEach((g, idx) => {
      if (g.show_on_main) dockPositions.push(idx);
    });
    const newGames = [...games];
    dockPositions.forEach((pos, idx) => {
      newGames[pos] = orderedDock[idx];
    });
    set({ games: newGames });
    try {
      await gamesApi.reorderGames(orderedIds);
    } catch {
      set({ games });
    }
  },
}));