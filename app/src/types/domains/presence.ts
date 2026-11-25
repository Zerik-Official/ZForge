/** Translated Rich Presence texts; placeholders are filled by the backend. */
export interface PresenceStrings {
  launching: string;
  running: string;
  login: string;
  realmList: string;
  characterSelect: string;
  characterCreate: string;
  loading: string;
  loadingProgress: string;
  character: string;
  characterXp: string;
  nameOnly: string;
  levelOnly: string;
  levelXp: string;
  inWorld: string;
  solo: string;
  party: string;
  raid: string;
  statusGroup: string;
  inCombat: string;
  dead: string;
  ghost: string;
  afk: string;
  raceClass: string;
  zoneSubZone: string;
  zoneDifficulty: string;
  dungeonNormal: string;
  dungeonHeroic: string;
  raidNormal: string;
  raidHeroic: string;
  races: Record<number, string>;
  classes: Record<number, string>;
  randomZones: RandomZone[];
}

/** A zone Rich Presence can show instead of the real one. */
export interface RandomZone {
  /** Image key uploaded to the Discord application. */
  image: string;
  name: string;
  /** First expansion the zone exists in. */
  expansion: "classic" | "tbc" | "wotlk";
}

/** What Discord shows, as the backend builds it. */
export interface PresenceActivity {
  details: string | null;
  state: string | null;
  largeImage: string;
  largeText: string | null;
  smallImage: string | null;
  smallText: string | null;
  /** Start in Unix seconds. */
  start: number | null;
  /** Group size as `[current, max]`. */
  party: [number, number] | null;
}

/** Moment of a session the settings preview shows; `live` is the running game. */
export type PresenceScene =
  | "live"
  | "launching"
  | "login"
  | "realm_list"
  | "character_select"
  | "character_create"
  | "loading"
  | "world"
  | "party"
  | "raid"
  | "afk"
  | "combat"
  | "dead"
  | "dungeon";

/** Character and places the preview shows; the names are translated. */
export interface PresenceSample {
  name: string;
  level: number;
  raceId: number;
  classId: number;
  zone: string;
  subZone: string;
  mapId: number;
  mapAreaId: number | null;
  dungeon: string;
  raid: string;
  expansion: string | null;
  realmlist: string | null;
  realm: string | null;
}
