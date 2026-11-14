import type { ConfigConflict } from "./settings";

/** A splash screen step: a translation key with its interpolation values. */
export interface BootProgress {
  key: string;
  params: Record<string, string>;
  percent: number;
}

export interface BootReport {
  conflicts: ConfigConflict[];
}
