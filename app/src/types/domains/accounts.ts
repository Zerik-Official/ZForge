/** A character seen on an account the last time the launcher logged in with it. */
export interface SavedCharacter {
  realm: string;
  name: string;
  slot: number;
  level: number;
  race_id: number;
  class_id: number;
  gender: number;
  map_id: number;
  zone_id: number;
  updated_at: number;
}

/** A game account; its password lives in the Windows Credential Manager. */
export interface Account {
  id: string;
  realmlist: string;
  username: string;
  label: string;
  default_realm: string;
  default_character: string;
  created_at: number;
}

export interface AccountSummary extends Account {
  has_password: boolean;
  characters: SavedCharacter[];
}

export interface AccountDraft {
  realmlist: string;
  username: string;
  label: string;
  default_realm: string;
  default_character: string;
}

/** How to start a game; without an account it starts as before. */
export interface LaunchChoice {
  account_id: string | null;
  /** Empty lets the client pick the realm saved in its settings. */
  realm: string;
  /** Empty stops at the character selection screen. */
  character: string;
  /** Keep the game window hidden until the character is in the world. */
  headless: boolean;
}
