import { bridge } from "../bridge";
import type { ApiResult, Game, GameInput } from "@/types/pywebview";

export class GamesApi {
  listGames(): Promise<Game[]> {
    return bridge().list_games();
  }

  addGame(payload: GameInput): Promise<Game> {
    return bridge().add_game(payload);
  }

  updateGame(payload: Game): Promise<Game> {
    return bridge().update_game(payload);
  }

  removeGame(id: string): Promise<ApiResult> {
    return bridge().remove_game(id);
  }

  reorderGames(orderedIds: string[]): Promise<ApiResult> {
    return bridge().reorder_games(orderedIds);
  }

  launchGame(gameId: string): Promise<ApiResult> {
    return bridge().launch_game(gameId);
  }

  installClient(): Promise<ApiResult> {
    return bridge().install_client();
  }

  repairClient(): Promise<ApiResult> {
    return bridge().repair_client();
  }
}

export const gamesApi = new GamesApi();