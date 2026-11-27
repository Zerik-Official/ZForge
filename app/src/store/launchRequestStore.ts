import { create } from "zustand";
import type { ShortcutAction } from "@/types/domains/system";

interface LaunchRequestState {
  /** Shortcut launch waiting for Home to start it. */
  request: ShortcutAction | null;
  /** Ask Home to launch a game as a shortcut described. */
  requestLaunch: (action: ShortcutAction) => void;
  /** Take the pending launch, once. */
  take: () => ShortcutAction | null;
}

export const useLaunchRequestStore = create<LaunchRequestState>((set, get) => ({
  request: null,
  requestLaunch(action) {
    set({ request: action });
  },
  take() {
    const request = get().request;
    if (request) set({ request: null });
    return request;
  },
}));
