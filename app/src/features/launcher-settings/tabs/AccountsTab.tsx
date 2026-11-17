import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { accountName, useAccounts } from "@/hooks/useAccounts";
import { t, useLocale } from "@/locales/i18n";
import { api, accountsApi, errorCode } from "@/services/api";
import type { AccountSummary } from "@/types/domains/accounts";
import type { SdkStatus } from "@/types/domains/sdk";
import type { ServerEntry } from "@/types/domains/server";
import { ACCOUNTS_SDK, sdkVersionAtLeast } from "@/utils/sdkVersion";
import { AccountModal } from "../components/AccountModal";

/**
 * Game accounts settings tab: accounts grouped by server with the
 * characters seen the last time the launcher logged in with them.
 */
export function AccountsTab() {
  useLocale();
  const { accounts, error: loadError, reload } = useAccounts();
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [sdk, setSdk] = useState<SdkStatus | null>(null);
  const [editing, setEditing] = useState<AccountSummary | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<AccountSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [serverList, status] = await Promise.all([api.listServers(), api.getSdkStatus()]);
        if (cancelled) return;
        setServers(serverList);
        setSdk(status);
      } catch (e) {
        if (!cancelled) setError(t(`common.errors.codes.${errorCode(e)}`));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const byServer = new Map<string, AccountSummary[]>();
    for (const account of accounts ?? []) {
      byServer.set(account.realmlist, [...(byServer.get(account.realmlist) ?? []), account]);
    }
    return [...byServer.entries()].map(([realmlist, list]) => ({
      realmlist,
      server: servers.find((server) => server.realmlists.includes(realmlist)) ?? null,
      accounts: list,
    }));
  }, [accounts, servers]);

  function openModal(account: AccountSummary | null) {
    setEditing(account);
    setModalOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    try {
      await accountsApi.deleteAccount(id);
      setError(null);
      await reload();
    } catch (e) {
      setError(t(`common.errors.codes.${errorCode(e)}`));
    }
  }

  if (!accounts) {
    return (
      <div className="flex flex-1 items-center justify-center text-(--muted)">
        {loadError ? (
          <span className="text-[12px] text-(--danger)">{t(`common.errors.codes.${errorCode(loadError)}`)}</span>
        ) : (
          <i className="fa-solid fa-spinner fa-spin text-[18px]" />
        )}
      </div>
    );
  }

  const sdkReady = sdk?.valid === true && sdkVersionAtLeast(sdk.version, ...ACCOUNTS_SDK);

  return (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[13px] font-semibold text-(--text)">{t("launcher.settings.accounts.title")}</h2>
          <p className="max-w-xl text-[11px] leading-relaxed text-(--muted)">{t("launcher.settings.accounts.description")}</p>
        </div>
        <button
          className="play-btn flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white cursor-pointer"
          onClick={() => openModal(null)}
        >
          <i className="fa-solid fa-plus text-[11px]" />
          {t("launcher.settings.accounts.add")}
        </button>
      </div>

      {sdk && !sdkReady ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <i className="fa-solid fa-circle-info mt-0.5 text-[13px] text-amber-500" />
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-amber-500">{t("launcher.settings.accounts.sdkRequired.title")}</span>
            <span className="text-[11px] leading-relaxed text-(--muted)">
              {t("launcher.settings.accounts.sdkRequired.description", { version: ACCOUNTS_SDK.join(".") })}
            </span>
          </div>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-(--border-strong) px-6 py-10 text-center">
          <i className="fa-solid fa-user-shield text-[20px] text-(--muted-2)" />
          <span className="text-[12px] text-(--muted)">{t("launcher.settings.accounts.empty")}</span>
        </div>
      ) : null}

      {groups.map((group) => (
        <div key={group.realmlist} className="flex flex-col gap-3 rounded-xl border border-(--border-strong) bg-(--bg-card) p-5">
          <div className="flex items-center gap-2">
            {group.server?.logo ? <img src={group.server.logo} alt="" className="h-5 w-5 rounded object-contain" /> : <i className="fa-solid fa-server text-[12px] text-(--muted)" />}
            <h3 className="text-[12px] font-semibold text-(--text-soft)">{group.server?.name ?? group.realmlist}</h3>
            <span className="text-[10.5px] text-(--muted-2)">{group.realmlist}</span>
          </div>

          {group.accounts.map((account) => (
            <div key={account.id} className="flex flex-col gap-2 rounded-lg border border-(--border) bg-(--bg-elevated) px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[12.5px] font-semibold text-(--text)">{accountName(account)}</span>
                  <span className="truncate text-[10.5px] text-(--muted)">
                    {account.label.trim() ? `${account.username} · ` : ""}
                    {account.default_realm || t("launcher.settings.accounts.noDefaultRealm")}
                    {account.default_character ? ` · ${account.default_character}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {account.has_password ? null : (
                    <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                      {t("launcher.settings.accounts.noPassword")}
                    </span>
                  )}
                  <button
                    className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-soft) cursor-pointer"
                    onClick={() => openModal(account)}
                    aria-label={t("common.edit")}
                  >
                    <i className="fa-solid fa-pen text-[11px]" />
                  </button>
                  <button
                    className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--bg-hover) hover:text-(--danger) cursor-pointer"
                    onClick={() => setDeleting(account)}
                    aria-label={t("common.delete")}
                  >
                    <i className="fa-solid fa-trash text-[11px]" />
                  </button>
                </div>
              </div>

              {account.characters.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {account.characters.map((character) => (
                    <span
                      key={`${character.realm}/${character.name}`}
                      className="rounded-md border border-(--border) bg-(--bg-card) px-2 py-1 text-[10.5px] text-(--text-soft)"
                      title={character.realm}
                    >
                      <span className="font-semibold">{character.name}</span>
                      <span className="text-(--muted)">
                        {" · "}
                        {t("launcher.settings.accounts.level", { level: character.level })}
                        {" "}
                        {t(`presence.races.${character.race_id}`)} {t(`presence.classes.${character.class_id}`)}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[10.5px] text-(--muted-2)">{t("launcher.settings.accounts.noCharacters")}</span>
              )}
            </div>
          ))}
        </div>
      ))}

      {error ? <span className="text-[12px] text-(--danger)">{error}</span> : null}

      {modalOpen ? (
        <AccountModal
          key={editing?.id ?? "new"}
          open
          account={editing}
          servers={servers}
          onClose={() => setModalOpen(false)}
          onSaved={() => void reload()}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        icon="fa-solid fa-trash"
        title={t("launcher.settings.accounts.confirmDelete")}
        description={t("launcher.settings.accounts.confirmDeleteDescription", { name: deleting ? accountName(deleting) : "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
