import { create } from "zustand";
import { api } from "@/services/api";
import type { Game, GameInput, AppConfig, AssetManifest } from "@/types/pywebview";

/**
 * Resolve which game should be shown on the main screen.
 *
 * Preference order: the remembered last-active game, then the first game
 * flagged `show_on_main`, then the first game overall.
 *
 * @param games   Saved games.
 * @param config  Application settings (may carry `last_active_game`).
 * @returns The id to mark active, or `null` when there are no games.
 */
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
  /** All saved games. */
  games: Game[];
  /** Id of the game currently shown on the main screen. */
  activeId: string | null;
  /** Bundled-asset catalogue for the add/edit modal. */
  assets: AssetManifest | null;
  /** Global application settings. */
  config: AppConfig | null;
  /** True once the initial backend load finished. */
  hydrated: boolean;

  /** Load games, assets and config from the backend. */
  hydrate: () => Promise<void>;
  /** Create a game and add it to the store. */
  addGame: (payload: GameInput) => Promise<Game>;
  /** Update a game in the store. */
  updateGame: (game: Game) => Promise<Game>;
  /** Remove a game from the store. */
  removeGame: (id: string) => Promise<void>;
  /** Mark a game as active on the main screen and persist the choice. */
  setActive: (id: string) => Promise<void>;
  /** Persist a new dock order and update local state optimistically. */
  reorderDock: (orderedIds: string[]) => Promise<void>;
}

export const useGamesStore = create<GamesState>((set, get) => ({
  games: [],
  activeId: null,
  assets: null,
  config: null,
  hydrated: false,

  async hydrate() {
    const [games, assets, config] = await Promise.all([
      api.listGames(),
      api.listAssets(),
      api.getAppConfig(),
    ]);
    set({ games, assets, config, hydrated: true, activeId: resolveActiveId(games, config) });
  },

  async addGame(payload) {
    const game = await api.addGame(payload);
    set((state) => ({
      games: [...state.games, game],
      activeId: state.activeId ?? game.id,
    }));
    return game;
  },

  async updateGame(game) {
    const updated = await api.updateGame(game);
    set((state) => ({
      games: state.games.map((item) => (item.id === updated.id ? updated : item)),
    }));
    return updated;
  },

  async removeGame(id) {
    await api.removeGame(id);
    set((state) => {
      const games = state.games.filter((item) => item.id !== id);
      const activeId = state.activeId === id ? resolveActiveId(games, state.config) : state.activeId;
      return { games, activeId };
    });
  },

  async setActive(id) {
    const config = get().config ?? { theme: "dark", last_active_game: null };
    const next: AppConfig = { ...config, last_active_game: id };
    await api.saveAppConfig(next);
    set({ activeId: id, config: next });
  },

  async reorderDock(orderedIds) {
    const { games } = get();
    const dock = games.filter((g) => g.show_on_main);
    if (orderedIds.length !== dock.length) return;
    const orderedDock = orderedIds
      .map((id) => games.find((g) => g.id === id)!)
      .filter(Boolean) as typeof games;
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
      await api.reorderGames(orderedIds);
    } catch {
      set({ games });
    }
  },
}));
