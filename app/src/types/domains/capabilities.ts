/** A launcher feature that needs the SDK. */
export type Feature = "live_session" | "notifications" | "whisper_reply" | "accounts" | "hidden_start";

/** Why a feature cannot be used. */
export type Unavailable = "sdk_missing" | "sdk_corrupted" | "sdk_outdated";

export interface FeatureStatus {
  feature: Feature;
  required_version: string;
  available: boolean;
  reason: Unavailable | null;
  /** Installing the latest published SDK would make it available. */
  fixable: boolean;
}

/** The installed SDK and what it allows (`capabilities://changed`). */
export interface Capabilities {
  sdk_version: string | null;
  latest_version: string | null;
  update_available: boolean;
  installing: boolean;
  features: FeatureStatus[];
}
