import { call } from "../bridge";
import type { ThemeManifest, ThemeSummary } from "@/types/domains/theme";

export class ThemesApi {
  listThemes(): Promise<ThemeSummary[]> {
    return call("list_themes");
  }

  /** The active theme with absolute file paths, or `null` for the built-in one. */
  getActiveTheme(): Promise<ThemeManifest | null> {
    return call("get_active_theme");
  }

  /** Pick a theme zip and install it; `null` when the dialog was cancelled. */
  importTheme(): Promise<ThemeSummary | null> {
    return call("import_theme");
  }

  deleteTheme(id: string): Promise<void> {
    return call("delete_theme", { id });
  }

  openThemesFolder(): Promise<void> {
    return call("open_themes_folder");
  }
}

export const themesApi = new ThemesApi();
