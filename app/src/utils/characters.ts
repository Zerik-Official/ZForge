/**
 * @module utils/characters
 * Portraits, class icons and class colors of game characters. The images are downloaded on
 * boot into `resources/characters`, so they show without an internet connection.
 */

import { resourceSrc } from "@/utils/asset";

/** Race ids that have a portrait. */
const PORTRAIT_RACES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 10, 11]);

/** Class ids that have an icon. */
const CLASS_IDS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11]);

/** Class colors used by the game interface (`RAID_CLASS_COLORS`). */
const CLASS_COLORS: Record<number, string> = {
  1: "#C79C6E",
  2: "#F58CBA",
  3: "#ABD473",
  4: "#FFF569",
  5: "#FFFFFF",
  6: "#C41F3B",
  7: "#0070DE",
  8: "#69CCF0",
  9: "#9482C9",
  11: "#FF7D0A",
};

/** Portrait shown when the race or gender of a character is unknown. */
export function unknownPortrait(): string {
  return resourceSrc("characters/portraits/unknown.webp");
}

/**
 * Address of the portrait of a race and gender.
 * @param race Race id of the character.
 * @param gender 0 for male, 1 for female.
 * @returns The address, or the unknown portrait when there is none for them.
 */
export function portraitSrc(race: number, gender: number): string {
  if (!PORTRAIT_RACES.has(race) || (gender !== 0 && gender !== 1)) return unknownPortrait();
  return resourceSrc(`characters/portraits/${race}-${gender}.webp`);
}

/**
 * Address of the icon of a class.
 * @param classId Class id of the character.
 * @returns The address, or null for an unknown class.
 */
export function classIconSrc(classId: number): string | null {
  return CLASS_IDS.has(classId) ? resourceSrc(`characters/classes/${classId}.jpg`) : null;
}

/**
 * Color of a class as the game interface shows it.
 * @param classId Class id of the character.
 * @returns The color, or null for an unknown class.
 */
export function classColor(classId: number): string | null {
  return CLASS_COLORS[classId] ?? null;
}
