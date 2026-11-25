import { call } from "../bridge";
import type { PresenceActivity, PresenceSample, PresenceScene, PresenceStrings } from "@/types/domains/presence";
import type { PresenceOptions } from "@/types/domains/settings";

export class PresenceApi {
  /** Send the Rich Presence texts in the current language. */
  setPresenceStrings(strings: PresenceStrings): Promise<void> {
    return call("set_presence_strings", { strings });
  }

  /** What Discord would show with these options for a scene of the sample session or the running game. */
  previewPresence(options: PresenceOptions, scene: PresenceScene, sample: PresenceSample): Promise<PresenceActivity | null> {
    return call("preview_presence", { options, scene, sample });
  }

  /** Addresses of the images uploaded to the Discord application, by asset key. */
  getPresenceAssets(): Promise<Record<string, string>> {
    return call("get_presence_assets");
  }
}

export const presenceApi = new PresenceApi();
