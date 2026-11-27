/** Version and commit of the running launcher. */
export interface BuildInfo {
  version: string;
  /** Full commit hash, when the build knew it. */
  commit: string | null;
  /** First characters of the commit hash. */
  commit_short: string | null;
  /** Commit date in ISO 8601 with its time zone. */
  commit_date: string | null;
  /** Whether the build included uncommitted changes. */
  dirty: boolean;
  /** Page of the commit in the public repository. */
  commit_url: string | null;
}

/** What a game shortcut does when it opens the launcher. */
export interface ShortcutAction {
  game_id: string;
  /** Launch the game instead of only selecting it. */
  launch: boolean;
  /** Account to log in with; `null` uses the last choice saved for the game. */
  account_id: string | null;
  realm: string | null;
  character: string | null;
  /** Start the game hidden until the character is in the world. */
  headless: boolean;
}
