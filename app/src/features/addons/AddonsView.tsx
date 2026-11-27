import { Notice } from "@/components/layout/Notice";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select, type SelectOption } from "@/components/ui/Select";
import { useSession } from "@/hooks/useSession";
import { t, useLocale } from "@/locales/i18n";
import { addonsApi, errorCode } from "@/services/api";
import { useGamesStore } from "@/store/gamesStore";
import type { Addon, AddonAccount, AddonReport, AddonTarget, GameAudit } from "@/types/domains/addon";
import { AddonAuditModal } from "./AddonAuditModal";
import { SEVERITY_STYLE } from "./severity";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";

type Filter = "all" | "enabled" | "disabled" | "problems";

const WHOLE_ACCOUNT = "";

/** Encode a character as a select value; realm and character are folder names. */
function characterKey(realm: string, character: string): string {
  return JSON.stringify([realm, character]);
}

function buildTarget(account: string, characterValue: string): AddonTarget | null {
  if (!account) return null;
  if (characterValue === WHOLE_ACCOUNT) return { account, realm: null, character: null };
  const [realm, character] = JSON.parse(characterValue) as [string, string];
  return { account, realm, character };
}

function characterCount(account: AddonAccount): number {
  return account.realms.reduce((total, realm) => total + realm.characters.length, 0);
}

function accountOptions(accounts: AddonAccount[]): SearchSelectOption[] {
  return accounts.map((account) => ({
    value: account.name,
    label: account.name,
    badge: t("launcher.addons.characterCount", { count: characterCount(account) }),
  }));
}

function characterOptions(account: AddonAccount | undefined): SearchSelectOption[] {
  const characters = (account?.realms ?? []).flatMap((realm) =>
    realm.characters.map((character) => ({
      value: characterKey(realm.name, character),
      label: character,
      sublabel: realm.name,
    })),
  );
  characters.sort((left, right) => left.label.localeCompare(right.label));
  return [{ value: WHOLE_ACCOUNT, label: t("launcher.addons.wholeAccount") }, ...characters];
}

/** Whether an addon has a `.toc` problem or something the addon check wants reviewed. */
function hasProblem(addon: Addon, report: AddonReport | undefined): boolean {
  const flagged = report?.severity === "warning" || report?.severity === "danger";
  return addon.outdated || addon.missingDependencies.length > 0 || flagged;
}

function errorText(error: unknown): string {
  return t(`common.errors.codes.${errorCode(error)}`);
}

/**
 * Addon manager: list the addons of a game, enable or disable them for an
 * account or character, install addon zips and delete addons.
 */
export function AddonsView() {
  useLocale();
  const games = useGamesStore((state) => state.games);
  const activeId = useGamesStore((state) => state.activeId);
  const session = useSession();

  const [chosenGameId, setGameId] = useState<string>("");
  const [accounts, setAccounts] = useState<AddonAccount[]>([]);
  const [accountName, setAccountName] = useState<string>("");
  const [characterValue, setCharacterValue] = useState<string>(WHOLE_ACCOUNT);
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [deleting, setDeleting] = useState<Addon | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [audit, setAudit] = useState<GameAudit | null>(null);
  const [inspecting, setInspecting] = useState<Addon | null>(null);

  const gameId = games.some((game) => game.id === chosenGameId) ? chosenGameId : (activeId ?? games[0]?.id ?? "");
  const target = useMemo(() => buildTarget(accountName, characterValue), [accountName, characterValue]);
  const selectedAccount = accounts.find((account) => account.name === accountName);
  const gameRunning = session !== null && session.phase !== "idle" && session.game_id === gameId;

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    addonsApi
      .listAccounts(gameId)
      .then((list) => {
        if (cancelled) return;
        setAccounts(list);
        setAccountName(list[0]?.name ?? "");
        setCharacterValue(WHOLE_ACCOUNT);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    addonsApi
      .getAudit(gameId)
      .then((result) => {
        if (!cancelled) setAudit(result);
      })
      .catch((e: unknown) => console.error("Could not read the addon check", e));
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    try {
      const [list, checked] = await Promise.all([addonsApi.listAddons(gameId, target), addonsApi.audit(gameId)]);
      setAddons(list);
      setAudit(checked);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [gameId, target]);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    addonsApi
      .listAddons(gameId, target)
      .then((list) => {
        if (cancelled) return;
        setAddons(list);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, target]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (addons ?? []).filter((addon) => {
      if (filter === "enabled" && !addon.enabled) return false;
      if (filter === "disabled" && addon.enabled) return false;
      if (filter === "problems" && !hasProblem(addon, audit?.addons[addon.folder])) return false;
      if (!needle) return true;
      return [addon.title, addon.folder, addon.author, addon.notes].some((part) => part.toLowerCase().includes(needle));
    });
  }, [addons, query, filter, audit]);

  async function setEnabled(folders: string[], enabled: boolean) {
    if (!target || folders.length === 0) return;
    setBusy(true);
    try {
      await addonsApi.setEnabled(gameId, target, folders, enabled);
      setAddons((current) =>
        current ? current.map((addon) => (folders.includes(addon.folder) ? { ...addon, enabled } : addon)) : current,
      );
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function install() {
    setBusy(true);
    try {
      const installed = await addonsApi.installAddons(gameId);
      if (installed) {
        setNotice(t("launcher.addons.installed", { names: installed.join(", ") }));
        await refresh();
      }
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const addon = deleting;
    setDeleting(null);
    if (!addon) return;
    try {
      await addonsApi.deleteAddon(gameId, addon.folder);
      setNotice(t("launcher.addons.deleted", { name: addon.title }));
      await refresh();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function openFolder() {
    try {
      await addonsApi.openAddonsFolder(gameId);
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (games.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-[13px] text-(--muted)">{t("launcher.addons.noGames")}</div>
    );
  }

  const gameOptions: SelectOption[] = games.map((game) => ({ value: game.id, label: game.name }));
  const filters: Filter[] = ["all", "enabled", "disabled", "problems"];
  const enabledCount = (addons ?? []).filter((addon) => addon.enabled).length;
  const dangerCount = Object.values(audit?.addons ?? {}).filter((report) => report.severity === "danger").length;

  return (
    <div className="flex h-full flex-col gap-4 px-12 pt-12 pb-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <h1 className="text-[26px] leading-[1.15] font-[650] text-(--text)">{t("launcher.addons.title")}</h1>
          <p className="max-w-[64ch] text-[13.5px] leading-relaxed text-(--muted)">{t("launcher.addons.description")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="ghost-btn flex items-center gap-2 rounded-[7px] px-3 py-2 text-[13px] font-medium cursor-pointer"
            onClick={() => void openFolder()}
          >
            <i className="fa-solid fa-folder-open text-[12px]" />
            {t("launcher.addons.openFolder")}
          </button>
          <button
            className="play-btn flex items-center gap-2 rounded-[7px] px-4 py-2 text-[13px] font-semibold disabled:opacity-50 cursor-pointer"
            onClick={() => void install()}
            disabled={busy}
          >
            <i className="fa-solid fa-file-zipper text-[11px]" />
            {t("launcher.addons.install")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <span className="field-label mb-0!">{t("launcher.addons.game")}</span>
          <Select value={gameId} options={gameOptions} onChange={setGameId} />
        </div>
        {accounts.length > 0 ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="field-label mb-0!">{t("launcher.addons.account")}</span>
              <SearchSelect
                value={accountName}
                options={accountOptions(accounts)}
                onChange={(name) => {
                  setAccountName(name);
                  setCharacterValue(WHOLE_ACCOUNT);
                }}
                searchPlaceholder={t("launcher.addons.searchAccount")}
                emptyText={t("launcher.addons.noAccountMatches")}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="field-label mb-0!">{t("launcher.addons.character")}</span>
              <SearchSelect
                value={characterValue}
                options={characterOptions(selectedAccount)}
                onChange={setCharacterValue}
                searchPlaceholder={t("launcher.addons.searchCharacter")}
                emptyText={t("launcher.addons.noCharacterMatches")}
              />
            </div>
          </>
        ) : (
          <div className="col-span-2 flex flex-col gap-1">
            <span className="field-label mb-0!">{t("launcher.addons.account")}</span>
            <span className="rounded-(--radius-sm) border border-(--border-strong) bg-(--bg-card) px-3 py-2 text-[12.5px] text-(--muted)">
              {t("launcher.addons.noAccounts")}
            </span>
          </div>
        )}
      </div>

      {dangerCount > 0 ? (
        <Notice
          tone="danger"
          icon="fa-solid fa-shield-halved"
          title={t("launcher.addons.audit.summary", { count: dangerCount })}
          description={t("launcher.addons.audit.summaryDescription")}
          action={
            <button
              className="ghost-btn shrink-0 rounded-[7px] px-3 py-1.5 text-[12.5px] cursor-pointer"
              onClick={() => setFilter("problems")}
            >
              {t("launcher.addons.audit.show")}
            </button>
          }
        />
      ) : null}

      {gameRunning ? (
        <Notice tone="warning" icon="fa-solid fa-triangle-exclamation" title={t("launcher.addons.gameRunning")} />
      ) : null}

      <div className="flex items-center gap-2">
        <input
          className="field-input flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("launcher.addons.search")}
        />
        <div className="flex items-center gap-0.5 rounded-(--radius-sm) border border-(--border) bg-(--bg-card) p-0.5" role="tablist">
          {filters.map((option) => (
            <button
              key={option}
              role="tab"
              aria-selected={filter === option}
              className={`rounded-[5px] px-3 py-1.5 text-[12.5px] transition-colors cursor-pointer ${
                filter === option ? "bg-(--bg-hover) text-(--text)" : "text-(--muted) hover:text-(--text-soft)"
              }`}
              onClick={() => setFilter(option)}
            >
              {t(`launcher.addons.filters.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[12.5px] text-(--muted)">
        <span>{addons ? t("launcher.addons.count", { enabled: enabledCount, total: addons.length }) : ""}</span>
        <div className="flex items-center gap-3">
          <button
            className="hover:text-(--text) disabled:opacity-50 cursor-pointer"
            disabled={!target || busy}
            onClick={() => void setEnabled(visible.map((addon) => addon.folder), true)}
          >
            {t("launcher.addons.enableAll")}
          </button>
          <button
            className="hover:text-(--text) disabled:opacity-50 cursor-pointer"
            disabled={!target || busy}
            onClick={() => void setEnabled(visible.map((addon) => addon.folder), false)}
          >
            {t("launcher.addons.disableAll")}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-(--radius) border border-(--border) bg-(--bg-card) will-change-transform [&>*+*]:border-t [&>*+*]:border-(--border)">
        {addons === null ? (
          <div className="flex flex-1 items-center justify-center text-(--muted)">
            <i className="fa-solid fa-spinner fa-spin text-[18px]" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[13px] text-(--muted)">
            {addons.length === 0 ? t("launcher.addons.empty") : t("launcher.addons.noMatches")}
          </div>
        ) : (
          visible.map((addon) => (
            <div key={addon.folder} className="flex items-start gap-3 px-4.5 py-3">
              <div className="min-w-0 flex-1">
                <Checkbox
                  checked={addon.enabled}
                  onChange={(checked) => void setEnabled([addon.folder], checked)}
                  label={addon.version ? `${addon.title}  v${addon.version}` : addon.title}
                  description={addon.notes.trim() || undefined}
                  disabled={!target || busy}
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-7.5 empty:hidden">
                  {addon.author.trim() ? (
                    <span className="flex items-center gap-1.5 px-0.5 py-0.5 text-[11.5px] text-(--muted-2)">
                      <i className="fa-solid fa-user-pen text-[10px]" />
                      {addon.author}
                    </span>
                  ) : null}
                  {addon.loadOnDemand ? (
                    <span className="rounded-md bg-(--bg-elevated) px-2 py-0.5 text-[11px] text-(--muted)">
                      {t("launcher.addons.loadOnDemand")}
                    </span>
                  ) : null}
                  {addon.outdated ? (
                    <span className="rounded-md bg-(--danger)/10 px-2 py-0.5 text-[11px] text-(--danger)">
                      {t("launcher.addons.outdated", { interface: addon.interface ?? "" })}
                    </span>
                  ) : null}
                  {audit?.addons[addon.folder]?.severity ? (
                    <AuditBadge report={audit.addons[addon.folder]} onOpen={() => setInspecting(addon)} />
                  ) : null}
                  {addon.missingDependencies.length > 0 ? (
                    <span className="rounded-md bg-(--danger)/10 px-2 py-0.5 text-[11px] text-(--danger)">
                      {t("launcher.addons.missingDependencies", { names: addon.missingDependencies.join(", ") })}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-(--muted) transition-colors hover:bg-(--bg-hover) hover:text-(--danger) cursor-pointer"
                onClick={() => setDeleting(addon)}
                aria-label={t("common.delete")}
              >
                <i className="fa-solid fa-trash text-[11px]" />
              </button>
            </div>
          ))
        )}
      </div>

      {notice ? <span className="text-[12.5px] text-(--text-soft)">{notice}</span> : null}
      {error ? <span className="text-[12.5px] text-(--danger)">{error}</span> : null}

      <AddonAuditModal
        title={inspecting?.title ?? null}
        report={inspecting ? (audit?.addons[inspecting.folder] ?? null) : null}
        onClose={() => setInspecting(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        icon="fa-solid fa-trash"
        destructive
        title={t("launcher.addons.confirmDelete")}
        description={t("launcher.addons.confirmDeleteDescription", { name: deleting?.title ?? "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/** Clickable badge with the most serious finding of the addon check. */
function AuditBadge({ report, onOpen }: { report: AddonReport; onOpen: () => void }) {
  if (!report.severity) return null;
  const style = SEVERITY_STYLE[report.severity];
  return (
    <button
      className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-[filter] hover:brightness-125 cursor-pointer ${style.badge}`}
      onClick={onOpen}
    >
      <i className={`${style.icon} text-[10px]`} aria-hidden="true" />
      {t(`launcher.addons.audit.badge.${report.severity}`, { count: report.findings.length })}
    </button>
  );
}
