/** Translated Rich Presence texts; placeholders are filled by the backend. */
export interface PresenceStrings {
  launching: string;
  running: string;
  login: string;
  characterSelect: string;
  loading: string;
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

/** Character and place the preview shows while no character is in the world. */
export interface PresenceSample {
  name: string;
  level: number;
  raceId: number;
  classId: number;
  zone: string;
  subZone: string;
  mapId: number;
  mapAreaId: number | null;
  expansion: string | null;
}
