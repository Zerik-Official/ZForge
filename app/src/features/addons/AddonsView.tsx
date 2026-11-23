import { useCallback, useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select, type SelectOption } from "@/components/ui/Select";
import { useSession } from "@/hooks/useSession";
import { t, useLocale } from "@/locales/i18n";
import { addonsApi, errorCode } from "@/services/api";
import { useGamesStore } from "@/store/gamesStore";
import type { Addon, AddonAccount, AddonTarget } from "@/types/domains/addon";

type Filter = "all" | "enabled" | "disabled" | "problems";

const NO_TARGET = "";

/** Encode a target as a select value; account, realm and character are folder names. */
function targetKey(target: AddonTarget): string {
  return JSON.stringify([target.account, target.realm, target.character]);
}

function parseTargetKey(key: string): AddonTarget | null {
  if (key === NO_TARGET) return null;
  const [account, realm, character] = JSON.parse(key) as [string, string | null, string | null];
  return { account, realm, character };
}

function targetOptions(accounts: AddonAccount[]): SelectOption[] {
  return accounts.flatMap((account) => [
    {
      value: targetKey({ account: account.name, realm: null, character: null }),
      label: t("launcher.addons.wholeAccount", { account: account.name }),
    },
    ...account.realms.flatMap((realm) =>
      realm.characters.map((character) => ({
        value: targetKey({ account: account.name, realm: realm.name, character }),
        label: `${account.name} · ${character} (${realm.name})`,
      })),
    ),
  ]);
}

function hasProblem(addon: Addon): boolean {
  return addon.outdated || addon.missingDependencies.length > 0;
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
  const [targetValue, setTargetValue] = useState<string>(NO_TARGET);
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [deleting, setDeleting] = useState<Addon | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const gameId = games.some((game) => game.id === chosenGameId) ? chosenGameId : (activeId ?? games[0]?.id ?? "");
  const target = useMemo(() => parseTargetKey(targetValue), [targetValue]);
  const gameRunning = session !== null && session.phase !== "idle" && session.game_id === gameId;

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    addonsApi
      .listAccounts(gameId)
      .then((list) => {
        if (cancelled) return;
        setAccounts(list);
        setTargetValue(list.length > 0 ? targetKey({ account: list[0].name, realm: null, character: null }) : NO_TARGET);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    try {
      setAddons(await addonsApi.listAddons(gameId, target));
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
      if (filter === "problems" && !hasProblem(addon)) return false;
      if (!needle) return true;
      return [addon.title, addon.folder, addon.author, addon.notes].some((part) => part.toLowerCase().includes(needle));
    });
  }, [addons, query, filter]);

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

  return (
    <div className="flex h-full flex-col gap-4 p-8 pb-18">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-(--text)">{t("launcher.addons.title")}</h1>
          <p className="max-w-xl text-[11px] leading-relaxed text-(--muted)">{t("launcher.addons.description")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="flex items-center gap-2 rounded-lg border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-[12.5px] font-medium text-(--text-soft) hover:bg-(--bg-hover) hover:text-(--text) cursor-pointer"
            onClick={() => void openFolder()}
          >
            <i className="fa-solid fa-folder-open text-[12px]" />
            {t("launcher.addons.openFolder")}
          </button>
          <button
            className="play-btn flex items-center gap-2 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50 cursor-pointer"
            onClick={() => void install()}
            disabled={busy}
          >
            <i className="fa-solid fa-file-zipper text-[11px]" />
            {t("launcher.addons.install")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-(--muted)">{t("launcher.addons.game")}</span>
          <Select value={gameId} options={gameOptions} onChange={setGameId} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-(--muted)">{t("launcher.addons.target")}</span>
          {accounts.length > 0 ? (
            <Select value={targetValue} options={targetOptions(accounts)} onChange={setTargetValue} />
          ) : (
            <span className="rounded-lg border border-(--border-strong) bg-(--bg-card) px-3 py-2 text-[11.5px] text-(--muted)">
              {t("launcher.addons.noAccounts")}
            </span>
          )}
        </div>
      </div>

      {gameRunning ? (
        <div className="flex items-center gap-2 rounded-lg border border-(--border-strong) bg-(--bg-card) px-3 py-2 text-[11.5px] text-(--text-soft)">
          <i className="fa-solid fa-triangle-exclamation text-(--danger)" />
          {t("launcher.addons.gameRunning")}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <input
          className="field-input flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("launcher.addons.search")}
        />
        <div className="flex items-center gap-1">
          {filters.map((option) => (
            <button
              key={option}
              className={`rounded-lg px-3 py-1.5 text-[11.5px] cursor-pointer ${
                filter === option ? "bg-(--primary-soft) text-(--text)" : "text-(--muted) hover:bg-(--bg-hover) hover:text-(--text)"
              }`}
              onClick={() => setFilter(option)}
            >
              {t(`launcher.addons.filters.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-(--muted)">
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

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 will-change-transform">
        {addons === null ? (
          <div className="flex flex-1 items-center justify-center text-(--muted)">
            <i className="fa-solid fa-spinner fa-spin text-[18px]" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[12px] text-(--muted)">
            {addons.length === 0 ? t("launcher.addons.empty") : t("launcher.addons.noMatches")}
          </div>
        ) : (
          visible.map((addon) => (
            <div
              key={addon.folder}
              className="flex items-start gap-3 rounded-xl border border-(--border-strong) bg-(--bg-card) px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <Checkbox
                  checked={addon.enabled}
                  onChange={(checked) => void setEnabled([addon.folder], checked)}
                  label={addon.version ? `${addon.title}  v${addon.version}` : addon.title}
                  description={[addon.author, addon.notes].filter((part) => part.trim() !== "").join(" · ")}
                  disabled={!target || busy}
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
                  {addon.loadOnDemand ? (
                    <span className="rounded-md bg-(--bg-elevated) px-2 py-0.5 text-[10px] text-(--muted)">
                      {t("launcher.addons.loadOnDemand")}
                    </span>
                  ) : null}
                  {addon.outdated ? (
                    <span className="rounded-md bg-(--bg-elevated) px-2 py-0.5 text-[10px] text-(--danger)">
                      {t("launcher.addons.outdated", { interface: addon.interface ?? "" })}
                    </span>
                  ) : null}
                  {addon.missingDependencies.length > 0 ? (
                    <span className="rounded-md bg-(--bg-elevated) px-2 py-0.5 text-[10px] text-(--danger)">
                      {t("launcher.addons.missingDependencies", { names: addon.missingDependencies.join(", ") })}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--bg-hover) hover:text-(--danger) cursor-pointer"
                onClick={() => setDeleting(addon)}
                aria-label={t("common.delete")}
              >
                <i className="fa-solid fa-trash text-[11px]" />
              </button>
            </div>
          ))
        )}
      </div>

      {notice ? <span className="text-[12px] text-(--text-soft)">{notice}</span> : null}
      {error ? <span className="text-[12px] text-(--danger)">{error}</span> : null}

      <ConfirmDialog
        open={deleting !== null}
        icon="fa-solid fa-trash"
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
