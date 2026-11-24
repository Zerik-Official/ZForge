import { useMemo, useState } from "react";
import { CharacterPortrait } from "@/components/game/CharacterPortrait";
import { TooltipSimple } from "@/components/ui/Tooltip";
import { t } from "@/locales/i18n";
import type { SavedCharacter } from "@/types/domains/accounts";
import { classColor } from "@/utils/characters";

/** Characters shown before the list is expanded. */
const PREVIEW_COUNT = 6;

interface CharacterRosterProps {
  characters: SavedCharacter[];
  /** Name of the character the account enters with by default. */
  defaultCharacter: string;
}

/**
 * Characters of an account grouped by realm, each with its portrait, class color, level,
 * race and class. Long lists show the first few until they are expanded.
 */
export function CharacterRoster({ characters, defaultCharacter }: CharacterRosterProps) {
  const [expanded, setExpanded] = useState(false);

  const realms = useMemo(() => {
    const sorted = [...characters].sort((a, b) => a.realm.localeCompare(b.realm) || a.slot - b.slot);
    const visible = expanded ? sorted : sorted.slice(0, PREVIEW_COUNT);
    const byRealm = new Map<string, SavedCharacter[]>();
    for (const character of visible) byRealm.set(character.realm, [...(byRealm.get(character.realm) ?? []), character]);
    return [...byRealm.entries()];
  }, [characters, expanded]);

  const hidden = characters.length - PREVIEW_COUNT;

  return (
    <div className="flex flex-col gap-3">
      {realms.map(([realm, list]) => (
        <div key={realm} className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-[11.5px] font-medium text-(--muted-2)">
            <i className="fa-solid fa-globe text-[10px]" />
            {realm}
          </span>
          <ul className="grid grid-cols-2 gap-1.5">
            {list.map((character) => {
              const race = t(`presence.races.${character.race_id}`);
              const className = t(`presence.classes.${character.class_id}`);
              const isDefault = character.name === defaultCharacter;
              return (
                <li
                  key={`${character.realm}/${character.name}`}
                  className="flex min-w-0 items-center gap-3 rounded-[9px] bg-(--bg-elevated) py-2 pr-3 pl-2 [--portrait-bg:var(--bg-elevated)]"
                >
                  <CharacterPortrait
                    race={character.race_id}
                    gender={character.gender}
                    classId={character.class_id}
                    size={36}
                    label={`${race} ${className}`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="truncate text-[13px] font-semibold"
                        style={{ color: classColor(character.class_id) ?? "var(--text)" }}
                      >
                        {character.name}
                      </span>
                      {isDefault ? (
                        <TooltipSimple content={t("launcher.settings.accounts.defaultCharacter")} side="top">
                          <i className="fa-solid fa-star text-[9px] text-(--primary)" />
                        </TooltipSimple>
                      ) : null}
                    </span>
                    <span className="truncate text-[11.5px] text-(--muted)">
                      {t("launcher.settings.accounts.level", { level: character.level })} · {race} {className}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {hidden > 0 ? (
        <button
          className="self-start rounded-md px-1 text-[12px] font-medium text-(--muted) transition-colors hover:text-(--text) cursor-pointer"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
        >
          {expanded
            ? t("launcher.settings.accounts.showFewer")
            : t("launcher.settings.accounts.showAll", { count: characters.length })}
          <i className={`fa-solid fa-chevron-down ml-1.5 text-[9px] transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      ) : null}
    </div>
  );
}
