import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SdkRequirement } from "@/components/sdk/SdkRequirement";
import { Checkbox } from "@/components/ui/Checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { Select, type SelectOption } from "@/components/ui/Select";
import { CharacterPortrait } from "@/components/game/CharacterPortrait";
import { accountName, accountRealms } from "@/hooks/useAccounts";
import { t } from "@/locales/i18n";
import type { AccountSummary, LaunchChoice } from "@/types/domains/accounts";
import type { FeatureStatus } from "@/types/domains/capabilities";
import { classColor } from "@/utils/characters";

const NO_ACCOUNT = "";
const STAY_IN_CHARACTER_SELECT = "";
/** Characters from which the list gets a search box. */
const SEARCH_FROM = 7;

interface LaunchSelectorProps {
  accounts: AccountSummary[];
  choice: LaunchChoice;
  onChange: (choice: LaunchChoice) => void;
  /** Whether the installed SDK can log in automatically. */
  accountsFeature: FeatureStatus | null;
  /** Whether the installed SDK can start the game in the background. */
  hiddenStartFeature: FeatureStatus | null;
  disabled?: boolean;
}

/**
 * Popover next to the Play button to start the game with an account, realm
 * and character, optionally hidden until the character is in the world.
 */
export function LaunchSelector({
  accounts,
  choice,
  onChange,
  accountsFeature,
  hiddenStartFeature,
  disabled = false,
}: LaunchSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.closest(".select-menu")) return;
      if (rootRef.current && !rootRef.current.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const account = accounts.find((entry) => entry.id === choice.account_id) ?? null;

  const accountOptions = useMemo<SelectOption[]>(
    () => [
      { value: NO_ACCOUNT, label: t("home.launch.noAccount") },
      ...accounts.map((entry) => ({ value: entry.id, label: `${accountName(entry)} · ${entry.realmlist}` })),
    ],
    [accounts],
  );

  const realmOptions = useMemo<ComboboxOption[]>(
    () => (account ? accountRealms(account).map((realm) => ({ value: realm, label: realm })) : []),
    [account],
  );

  const characters = useMemo(() => {
    const realm = choice.realm.trim();
    return (account?.characters ?? [])
      .filter((character) => !realm || character.realm === realm)
      .sort((a, b) => a.realm.localeCompare(b.realm) || a.slot - b.slot);
  }, [account, choice.realm]);

  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shownCharacters = needle
    ? characters.filter(
        (character) =>
          character.name.toLowerCase().includes(needle) ||
          t(`presence.classes.${character.class_id}`).toLowerCase().includes(needle),
      )
    : characters;
  const selectedCharacter = characters.find((character) => character.name === choice.character) ?? null;
  const unknownCharacter = choice.character !== "" && selectedCharacter === null;

  function pickCharacter(character: string) {
    onChange({ ...choice, character, headless: character !== "" && choice.headless });
  }

  function selectAccount(id: string) {
    const next = accounts.find((entry) => entry.id === id) ?? null;
    onChange({
      account_id: next?.id ?? null,
      realm: next?.default_realm ?? "",
      character: next?.default_character ?? "",
      headless: next !== null && next.default_character !== "" && choice.headless,
    });
  }

  const title = account ? choice.character || t("home.launch.characterSelectShort") : t("home.launch.noAccount");
  const subtitle = account
    ? choice.realm.trim()
      ? t("home.launch.accountOnRealm", { account: accountName(account), realm: choice.realm.trim() })
      : accountName(account)
    : t("home.launch.pickAccount");

  return (
    <div className="relative" ref={rootRef}>
      <button
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex h-13 max-w-72 items-center gap-3 rounded-(--radius) border border-(--border-strong) bg-(--bg-card)/90 pr-4 pl-2 text-left backdrop-blur-md transition-colors hover:bg-(--bg-elevated) disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
      >
        {selectedCharacter ? (
          <span className="relative [--portrait-bg:var(--bg-card)]">
            <CharacterPortrait
              race={selectedCharacter.race_id}
              gender={selectedCharacter.gender}
              classId={selectedCharacter.class_id}
              size={36}
            />
            {choice.headless ? (
              <span className="absolute -top-1 -left-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-(--bg-card) bg-(--bg-elevated) text-[8px] text-(--text-soft)">
                <i className="fa-solid fa-eye-slash" />
              </span>
            ) : null}
          </span>
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-(--bg-elevated) text-[14px] text-(--text-soft)">
            <i className={`fa-solid ${choice.headless && account ? "fa-eye-slash" : "fa-user"}`} />
          </span>
        )}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className="truncate text-[13.5px] font-semibold text-(--text)"
            style={selectedCharacter ? { color: classColor(selectedCharacter.class_id) ?? undefined } : undefined}
          >
            {title}
          </span>
          <span className="truncate text-[12px] text-(--muted)">{subtitle}</span>
        </span>
        <i className={`fa-solid fa-chevron-up ml-1 text-[10px] text-(--muted) transition-transform ${open ? "" : "rotate-180"}`} />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-20 mb-3 flex w-88 flex-col gap-3.5 rounded-(--radius-lg) border border-(--border-strong) bg-(--bg-elevated) p-4 shadow-(--shadow-lg) animate-[popIn_0.15s_ease_both]">
          {accountsFeature?.available === false ? (
            <SdkRequirement status={accountsFeature} />
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="field-label">{t("home.launch.account")}</label>
              <Select value={account?.id ?? NO_ACCOUNT} options={accountOptions} onChange={selectAccount} />
            </div>
          )}

          {account ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="field-label">{t("home.launch.realm")}</label>
                <Combobox
                  value={choice.realm}
                  onChange={(realm) => onChange({ ...choice, realm })}
                  options={realmOptions}
                  placeholder={t("home.launch.realmPlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="field-label">{t("home.launch.character")}</label>
                {characters.length >= SEARCH_FROM ? (
                  <input
                    className="field-input"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("home.launch.searchCharacter")}
                    spellCheck={false}
                    autoComplete="off"
                  />
                ) : null}
                <div
                  role="listbox"
                  aria-label={t("home.launch.character")}
                  className="flex max-h-60 flex-col gap-px overflow-y-auto rounded-lg border border-(--border) bg-(--bg-card) p-1 will-change-transform [--portrait-bg:var(--bg-card)]"
                >
                  <CharacterOption
                    active={choice.character === STAY_IN_CHARACTER_SELECT}
                    onPick={() => pickCharacter(STAY_IN_CHARACTER_SELECT)}
                    icon="fa-solid fa-users"
                    title={t("home.launch.stayInCharacterSelect")}
                  />
                  {shownCharacters.map((character) => (
                    <CharacterOption
                      key={`${character.realm}/${character.name}`}
                      active={character.name === choice.character}
                      onPick={() => pickCharacter(character.name)}
                      portrait={
                        <CharacterPortrait
                          race={character.race_id}
                          gender={character.gender}
                          classId={character.class_id}
                          size={30}
                        />
                      }
                      title={character.name}
                      color={classColor(character.class_id)}
                      subtitle={`${t("launcher.settings.accounts.level", { level: character.level })} · ${t(`presence.classes.${character.class_id}`)}${choice.realm.trim() ? "" : ` · ${character.realm}`}`}
                    />
                  ))}
                  {unknownCharacter ? (
                    <CharacterOption active onPick={() => undefined} icon="fa-solid fa-user" title={choice.character} />
                  ) : null}
                  {needle && shownCharacters.length === 0 ? (
                    <span className="px-2.5 py-2 text-[12px] text-(--muted)">{t("home.launch.noCharacterMatches")}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={choice.headless}
                  onChange={(headless) => onChange({ ...choice, headless })}
                  label={t("home.launch.headless")}
                  description={t("home.launch.headlessDescription")}
                  disabled={choice.character === "" || hiddenStartFeature?.available === false}
                />
                <SdkRequirement status={hiddenStartFeature} variant="badge" />
              </div>
            </>
          ) : accountsFeature?.available === false ? null : (
            <span className="text-[12.5px] leading-relaxed text-(--muted)">
              {accounts.length === 0 ? t("home.launch.noAccounts") : t("home.launch.noAccountDescription")}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface CharacterOptionProps {
  active: boolean;
  onPick: () => void;
  title: string;
  subtitle?: string;
  /** Class color of the name. */
  color?: string | null;
  portrait?: ReactNode;
  /** Font Awesome class used when there is no portrait. */
  icon?: string;
}

/** One row of the character list: portrait or icon, name in its class color and details. */
function CharacterOption({ active, onPick, title, subtitle, color, portrait, icon }: CharacterOptionProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onPick}
      className={`flex min-h-10 items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors cursor-pointer ${
        active ? "bg-(--bg-hover)" : "hover:bg-(--bg-elevated)"
      }`}
    >
      {portrait ?? (
        <span className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[7px] bg-(--bg-elevated) text-[11px] text-(--muted)">
          <i className={icon} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[12.5px] font-semibold" style={{ color: color ?? "var(--text)" }}>
          {title}
        </span>
        {subtitle ? <span className="truncate text-[11px] text-(--muted)">{subtitle}</span> : null}
      </span>
      {active ? <i className="fa-solid fa-check mr-1 text-[10px] text-(--primary)" /> : null}
    </button>
  );
}
