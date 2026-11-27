export interface SdkStatus {
  installed: boolean;
  valid: boolean;
  version: string | null;
  path: string | null;
  missing_files: string[];
  needs_install: boolean;
  needs_repair: boolean;
  application_id_configured: boolean;
  discord_enabled: boolean;
  discord_auto_update: boolean;
  sdk_last_error: string | null;
  sdk_ever_installed?: boolean;
  latest_version: string | null;
  latest_url: string | null;
  update_available: boolean;
  installing: boolean;
  /** Whether the installed binaries are the published ones; null without a valid SDK. */
  integrity: SdkIntegrity | null;
}

export interface SdkDownloadProgress {
  percent: number;
  downloaded: number;
  total: number;
  speed: number;
  eta: number;
  version: string;
}

export interface InstalledSdk {
  version: string;
  path: string;
}

export interface SdkLatestInfo {
  tag_name: string;
  version: string;
  browser_download_url: string;
  size: number | null;
}

/** Whether the installed SDK version and hashes match its GitHub release. */
export type SdkIntegrity =
  | { state: "verified" }
  | { state: "trusted"; files: string[] }
  | { state: "mismatch"; files: string[]; unknown_version: boolean }
  | { state: "unknown" };
