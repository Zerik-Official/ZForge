import { call } from "../bridge";
import type { Game, GameDraft } from "@/types/domains/game";

function toDraft(game: Game | GameDraft): GameDraft {
  return {
    name: game.name,
    expansion: game.expansion,
    exe_path: game.exe_path,
    bg_video: game.bg_video,
    icon: game.icon,
    poster: game.poster,
    box: game.box ?? "",
    show_on_main: game.show_on_main,
  };
}

export class GamesApi {
  listGames(): Promise<Game[]> {
    return call("list_games");
  }

  addGame(draft: GameDraft): Promise<Game> {
    return call("add_game", { draft: toDraft(draft) });
  }

  updateGame(game: Game): Promise<Game> {
    return call("update_game", { gameId: game.id, draft: toDraft(game) });
  }

  removeGame(gameId: string): Promise<void> {
    return call("remove_game", { gameId });
  }

  reorderGames(orderedIds: string[]): Promise<void> {
    return call("reorder_games", { orderedIds });
  }

  launchGame(gameId: string): Promise<void> {
    return call("launch_game", { gameId });
  }
}

export const gamesApi = new GamesApi();
