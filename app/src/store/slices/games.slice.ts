import type { StateCreator } from "zustand";
import { gamesApi } from "@/services/api/domains/games.api";
import type { Game, GameDraft } from "@/types/domains/game";

export interface GamesSlice {
  games: Game[];
  activeId: string | null;
  addGame: (payload: GameDraft) => Promise<Game>;
  updateGame: (game: Game) => Promise<Game>;
  removeGame: (id: string) => Promise<void>;
  reorderDock: (orderedIds: string[]) => Promise<void>;
}

export const createGamesSlice: StateCreator<GamesSlice, [], [], GamesSlice> = (set, get) => ({
  games: [],
  activeId: null,

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
      return { games } as Partial<GamesSlice>;
    });
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
});