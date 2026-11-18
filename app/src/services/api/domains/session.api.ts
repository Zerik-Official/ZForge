import { call } from "../bridge";
import type { LaunchChoice } from "@/types/domains/accounts";
import type { SessionSnapshot } from "@/types/domains/session";

export class SessionApi {
  getSession(): Promise<SessionSnapshot> {
    return call("get_session");
  }

  /** Start a game; progress and late errors arrive through `session://changed`. */
  launchGame(gameId: string, choice?: LaunchChoice): Promise<void> {
    return call("launch_game", { gameId, choice: choice ?? null });
  }
}

export const sessionApi = new SessionApi();
