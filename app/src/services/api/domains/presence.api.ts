import { call } from "../bridge";
import type { PresenceActivity, PresenceSample, PresenceStrings } from "@/types/domains/presence";
import type { PresenceOptions } from "@/types/domains/settings";

export class PresenceApi {
  /** Send the Rich Presence texts in the current language. */
  setPresenceStrings(strings: PresenceStrings): Promise<void> {
    return call("set_presence_strings", { strings });
  }

  /** What Discord would show with these options; the sample is used while no character is in the world. */
  previewPresence(options: PresenceOptions, sample: PresenceSample): Promise<PresenceActivity | null> {
    return call("preview_presence", { options, sample });
  }

  /** Addresses of the images uploaded to the Discord application, by asset key. */
  getPresenceAssets(): Promise<Record<string, string>> {
    return call("get_presence_assets");
  }
}

export const presenceApi = new PresenceApi();
