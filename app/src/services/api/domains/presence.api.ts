import { call } from "../bridge";
import type { PresenceStrings } from "@/types/domains/presence";

export class PresenceApi {
  /** Send the Rich Presence texts in the current language. */
  setPresenceStrings(strings: PresenceStrings): Promise<void> {
    return call("set_presence_strings", { strings });
  }
}

export const presenceApi = new PresenceApi();
