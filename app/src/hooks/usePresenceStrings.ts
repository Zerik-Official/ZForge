/**
 * usePresenceStrings — sends the Rich Presence texts to the backend in the
 * current language, on startup and whenever the language changes.
 */

import { useEffect } from "react";
import { t, useLocale } from "@/locales/i18n";
import { presenceApi } from "@/services/api";
import type { PresenceStrings } from "@/types/domains/presence";

const RACE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11];
const CLASS_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11];

function byId(prefix: string, ids: number[]): Record<number, string> {
  return Object.fromEntries(ids.map((id) => [id, t(`${prefix}.${id}`)]));
}

function buildStrings(): PresenceStrings {
  return {
    launching: t("presence.launching"),
    running: t("presence.running"),
    login: t("presence.login"),
    characterSelect: t("presence.characterSelect"),
    loading: t("presence.loading"),
    character: t("presence.character"),
    characterXp: t("presence.characterXp"),
    solo: t("presence.solo"),
    party: t("presence.party"),
    raid: t("presence.raid"),
    statusGroup: t("presence.statusGroup"),
    inCombat: t("presence.inCombat"),
    dead: t("presence.dead"),
    ghost: t("presence.ghost"),
    afk: t("presence.afk"),
    raceClass: t("presence.raceClass"),
    zoneSubZone: t("presence.zoneSubZone"),
    zoneDifficulty: t("presence.zoneDifficulty"),
    dungeonNormal: t("presence.dungeonNormal"),
    dungeonHeroic: t("presence.dungeonHeroic"),
    raidNormal: t("presence.raidNormal"),
    raidHeroic: t("presence.raidHeroic"),
    races: byId("presence.races", RACE_IDS),
    classes: byId("presence.classes", CLASS_IDS),
  };
}

export function usePresenceStrings(): void {
  const locale = useLocale();

  useEffect(() => {
    presenceApi
      .setPresenceStrings(buildStrings())
      .catch((error: unknown) => console.error("Could not send Rich Presence texts", error));
  }, [locale]);
}
