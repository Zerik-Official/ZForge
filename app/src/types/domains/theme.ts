/** An image drawn as is; `file` is an absolute path once loaded. */
export interface ThemeImage {
  file: string;
  width: number | null;
  height: number | null;
}

/** A nine-slice frame: slice and border are top, right, bottom, left. */
export interface ThemeFrame {
  file: string;
  slice: [number, number, number, number];
  border: [number, number, number, number] | null;
  fill: boolean;
}

export interface ThemeControls {
  checkbox: { box: ThemeImage; check: ThemeImage; hover: ThemeImage | null; checkDisabled: ThemeImage | null } | null;
  slider: { track: ThemeFrame; thumb: ThemeImage } | null;
  select: { frame: ThemeFrame; arrow: ThemeImage | null } | null;
  tab: { active: ThemeFrame; inactive: ThemeFrame } | null;
  panel: ThemeFrame | null;
}

export interface LayoutControl {
  setting: string;
  x: number;
  y: number;
  width: number;
}

export interface LayoutSection {
  title: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  framed: boolean;
  controls: LayoutControl[];
}

export interface ThemeLayout {
  width: number;
  height: number;
  sections: LayoutSection[];
}

/** The active theme as returned by the backend. */
export interface ThemeManifest {
  schemaVersion: number;
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  /** Launcher versions the theme supports, such as `>=0.2.0, <=1.0.0`. */
  requires: string | null;
  /** Absolute path of the icon. */
  icon: string | null;
  /** Absolute paths of the screenshots. */
  previews: string[];
  colors: Record<string, string>;
  fonts: { family: string; file: string }[];
  typography: { body: string | null; heading: string | null };
  controls: ThemeControls;
  /** Layouts by settings category id. */
  layouts: Record<string, ThemeLayout>;
}

/** Why a theme cannot be used, with the field, file or position concerned. */
export interface ThemeError {
  problem: string;
  detail: string;
}

/** A theme as listed in the appearance tab. */
export interface ThemeSummary {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  /** Absolute path of the icon. */
  icon: string | null;
  /** Absolute paths of the screenshots. */
  previews: string[];
  /** Launcher versions the theme supports. */
  requires: string | null;
  /** The running launcher satisfies `requires`. */
  compatible: boolean;
  /** Why the theme cannot be used, when it is invalid. */
  error: ThemeError | null;
}

/** Identifier of the built-in theme. */
export const BUILT_IN_THEME = "dark";
