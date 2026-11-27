/** An installed addon described by its `.toc` file. */
export interface Addon {
  /** Folder name, also used by the game in `AddOns.txt`. */
  folder: string;
  title: string;
  notes: string;
  author: string;
  version: string;
  /** `## Interface`, the game version the addon was written for. */
  interface: number | null;
  dependencies: string[];
  optionalDependencies: string[];
  /** Required addons that are not installed. */
  missingDependencies: string[];
  loadOnDemand: boolean;
  /** Whether the game loads it for the selected account or character. */
  enabled: boolean;
  /** The `## Interface` differs from the version of the game. */
  outdated: boolean;
}

/** Account, and optionally character, whose `AddOns.txt` is read or written. */
export interface AddonTarget {
  account: string;
  realm: string | null;
  character: string | null;
}

export interface AddonRealm {
  name: string;
  characters: string[];
}

/** An account folder under `WTF\Account` with its realms and characters. */
export interface AddonAccount {
  name: string;
  realms: AddonRealm[];
}

/** How serious a finding of the addon check is. */
export type AddonSeverity = "info" | "warning" | "danger";

/** A problem in a `.toc` or a risky piece of code found in an addon. */
export interface AddonFinding {
  /** Rule that produced it; its title and explanation are translated from it. */
  rule: string;
  severity: AddonSeverity;
  /** File inside the addon folder; empty for folder problems. */
  file: string;
  /** First line where it appears; `0` when it applies to the whole file. */
  line: number;
  /** How many times it appears in the file. */
  count: number;
  /** The code or `.toc` entry where it first appears. */
  excerpt: string;
}

/** Findings of one addon, most serious first. */
export interface AddonReport {
  severity: AddonSeverity | null;
  findings: AddonFinding[];
}

/** Findings of the installed addons of a game, by addon folder. */
export interface GameAudit {
  addons: Record<string, AddonReport>;
  /** How many addon folders were checked. */
  checked: number;
}
