import { create } from "zustand";
import { themesApi } from "@/services/api";
import type { ThemeControls, ThemeManifest } from "@/types/domains/theme";
import { applyTheme } from "@/utils/theme";

interface ThemeState {
  /** Active installed theme; `null` for the built-in one. */
  theme: ThemeManifest | null;
  /** Read the active theme from the backend and apply it. */
  load: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: null,
  async load() {
    try {
      const theme = await themesApi.getActiveTheme();
      await applyTheme(theme);
      set({ theme });
    } catch (error) {
      console.error("Could not load the active theme", error);
      await applyTheme(null);
      set({ theme: null });
    }
  },
}));

/** Control images of the active theme, or `null` without a theme. */
export function useThemeControls(): ThemeControls | null {
  return useThemeStore((state) => state.theme?.controls ?? null);
}
