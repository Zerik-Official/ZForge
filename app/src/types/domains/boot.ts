import type { ConfigConflict } from "./settings";

/** A splash screen step: a translation key with its interpolation values. */
export interface BootProgress {
  key: string;
  params: Record<string, string>;
  percent: number;
}

export interface BootReport {
  conflicts: ConfigConflict[];
  /** A newer launcher version, when one was published. */
  update: UpdateInfo | null;
}

/** A newer launcher version found on boot. */
export interface UpdateInfo {
  version: string;
  currentVersion: string;
  /** Release notes, in Markdown. */
  notes: string | null;
  date: string | null;
}

/** Progress of the launcher update download. */
export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

/** Progress of the media downloaded from the assets CDN during the boot. */
export interface ResourcesProgress {
  filesDone: number;
  filesTotal: number;
  /** Bytes downloaded so far. */
  downloaded: number;
  /** Bytes of every missing file, as far as the server reported them. */
  total: number;
  bytesPerSecond: number;
  /** Path of the file being downloaded. */
  current: string;
}
