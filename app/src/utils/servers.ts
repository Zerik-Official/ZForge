/**
 * @module utils/servers
 * Helpers for local development servers: a realmlist on this computer and the default realm
 * names of the usual server cores.
 */

/** Icon shown for a server running on this computer. */
export const LOCAL_SERVER_ICON = "/assets/cores/dev.svg";

/** A realm name that a server core creates by default. */
export interface CoreRealm {
  /** Realm name written in the core's database. */
  realm: string;
  /** Name of the server core. */
  core: string;
  /** Logo of the server core. */
  logo: string;
}

/** Default realm names of TrinityCore and AzerothCore. */
export const CORE_REALMS: CoreRealm[] = [
  { realm: "Trinity", core: "TrinityCore", logo: "/assets/cores/trinitycore.png" },
  { realm: "AzerothCore", core: "AzerothCore", logo: "/assets/cores/azerothcore.png" },
];

/**
 * Whether a realmlist points to this computer.
 * @param realmlist Realmlist address, optionally with a port.
 * @returns True for `localhost`, `127.x.x.x` and `::1`.
 */
export function isLocalRealmlist(realmlist: string): boolean {
  const address = realmlist.trim().toLowerCase();
  if (address === "::1" || /^\[::1\](:\d+)?$/.test(address)) return true;
  const host = address.replace(/:\d+$/, "");
  return host === "localhost" || /^127(\.\d{1,3}){3}$/.test(host);
}
