export type SessionPhase =
  | "idle"
  | "launching"
  | "running"
  | "loading"
  | "login"
  | "realm_list"
  | "character_select"
  | "character_create"
  | "in_world";

export type LaunchMode = "direct" | "sdk";

export interface CharacterInfo {
  name: string;
  level: number;
  race_id: number;
  class_id: number;
  xp: number;
  max_xp: number;
}

export type GroupKind = "solo" | "party" | "raid";

export interface GroupInfo {
  kind: GroupKind;
  /** Members including the player (only those the client has loaded). */
  members: number;
}

export type InstanceKind = "party" | "raid" | "pvp" | "arena";

export interface InstanceInfo {
  kind: InstanceKind;
  name: string;
  difficulty: number;
  max_players: number;
}

export interface LocationInfo {
  map_id: number;
  zone_id: number;
  map_area_id: number | null;
  zone: string;
  sub_zone: string;
  instance: InstanceInfo | null;
}

export interface PlayerStatus {
  in_combat: boolean;
  dead: boolean;
  ghost: boolean;
  mounted: boolean;
  flying: boolean;
  swimming: boolean;
  afk: boolean;
  dnd: boolean;
}

/** Loading screen image from `LoadingScreens.dbc` (SDK 1.2+). */
export interface LoadingBackground {
  id: number;
  name: string;
  file: string;
  hasWideScreen: boolean;
}

export interface LoadingScreenInfo {
  map_id: number | null;
  background: LoadingBackground | null;
}

/** Everything the backend knows about the running game (`session://changed`). */
export interface SessionSnapshot {
  phase: SessionPhase;
  mode: LaunchMode | null;
  game_id: string | null;
  expansion: string | null;
  started_at: number | null;
  /** Realm list host the game connects to, when known. */
  realmlist: string | null;
  /** Realm the launcher logs in to, when known. */
  realm: string | null;
  loading_progress: number | null;
  loading_screen: LoadingScreenInfo | null;
  character: CharacterInfo | null;
  location: LocationInfo | null;
  status: PlayerStatus | null;
  group: GroupInfo | null;
  sdk_connected: boolean;
  last_error: string | null;
  /** Why the automatic login or entering the world failed, while the game runs. */
  login_error: string | null;
}
