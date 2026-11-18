import { useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { Select, type SelectOption } from "@/components/ui/Select";
import { accountName, accountRealms } from "@/hooks/useAccounts";
import { t } from "@/locales/i18n";
import type { AccountSummary, LaunchChoice } from "@/types/domains/accounts";

const NO_ACCOUNT = "";
const STAY_IN_CHARACTER_SELECT = "";

interface LaunchSelectorProps {
  accounts: AccountSummary[];
  choice: LaunchChoice;
  onChange: (choice: LaunchChoice) => void;
  disabled?: boolean;
}

/**
 * Popover next to the Play button to start the game with an account, realm
 * and character, optionally hidden until the character is in the world.
 */
export function LaunchSelector({ accounts, choice, onChange, disabled = false }: LaunchSelectorProps) {
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

  const characterOptions = useMemo<SelectOption[]>(() => {
    const realm = choice.realm.trim();
    const characters = (account?.characters ?? []).filter((character) => !realm || character.realm === realm);
    const options: SelectOption[] = [
      { value: STAY_IN_CHARACTER_SELECT, label: t("home.launch.stayInCharacterSelect") },
      ...characters.map((character) => ({
        value: character.name,
        label: `${character.name} · ${t("launcher.settings.accounts.level", { level: character.level })} ${t(`presence.classes.${character.class_id}`)}`,
      })),
    ];
    if (choice.character && !options.some((option) => option.value === choice.character)) {
      options.push({ value: choice.character, label: choice.character });
    }
    return options;
  }, [account, choice.realm, choice.character]);

  function selectAccount(id: string) {
    const next = accounts.find((entry) => entry.id === id) ?? null;
    onChange({
      account_id: next?.id ?? null,
      realm: next?.default_realm ?? "",
      character: next?.default_character ?? "",
      headless: next !== null && next.default_character !== "" && choice.headless,
    });
  }

  const summary = account
    ? [accountName(account), choice.character || t("home.launch.characterSelectShort")].join(" · ")
    : t("home.launch.noAccount");

  return (
    <div className="relative" ref={rootRef}>
      <button
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-11 max-w-50 items-center gap-2 rounded-xl border border-(--border-strong) bg-(--bg-elevated) px-3 text-[12px] text-(--text-soft) transition-colors hover:border-(--primary) hover:bg-(--bg-hover) disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
      >
        <i className={`fa-solid ${choice.headless && account ? "fa-eye-slash" : "fa-user"} text-[12px] text-(--muted)`} />
        <span className="truncate">{summary}</span>
        <i className={`fa-solid fa-chevron-up text-[9px] text-(--muted) transition-transform ${open ? "" : "rotate-180"}`} />
      </button>

      {open ? (
        <div className="absolute bottom-full right-0 mb-3 flex w-80 flex-col gap-3 rounded-2xl border border-(--border-strong) bg-(--bg-elevated) p-4 shadow-2xl">
          <div className="flex flex-col gap-1.5">
            <label className="field-label">{t("home.launch.account")}</label>
            <Select value={account?.id ?? NO_ACCOUNT} options={accountOptions} onChange={selectAccount} />
          </div>

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
                <Select
                  value={choice.character}
                  options={characterOptions}
                  onChange={(character) => onChange({ ...choice, character, headless: character !== "" && choice.headless })}
                />
              </div>
              <Checkbox
                checked={choice.headless}
                onChange={(headless) => onChange({ ...choice, headless })}
                label={t("home.launch.headless")}
                description={t("home.launch.headlessDescription")}
                disabled={choice.character === ""}
              />
            </>
          ) : (
            <span className="text-[11px] leading-relaxed text-(--muted)">
              {accounts.length === 0 ? t("home.launch.noAccounts") : t("home.launch.noAccountDescription")}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
