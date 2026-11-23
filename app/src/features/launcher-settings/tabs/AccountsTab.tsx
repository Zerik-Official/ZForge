import { useEffect, useMemo, useState } from "react";
import { PageState } from "@/components/layout/PageState";
import { SettingsGroup, SettingsPage } from "@/components/layout/SettingsPage";
import { SdkRequirement } from "@/components/sdk/SdkRequirement";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { accountName, useAccounts } from "@/hooks/useAccounts";
import { featureStatus, useCapabilities } from "@/hooks/useCapabilities";
import { t, useLocale } from "@/locales/i18n";
import { api, accountsApi, errorCode } from "@/services/api";
import type { AccountSummary } from "@/types/domains/accounts";
import type { ServerEntry } from "@/types/domains/server";
import { AccountModal } from "../components/AccountModal";

/**
 * Game accounts settings tab: accounts grouped by server with the
 * characters seen the last time the launcher logged in with them.
 */
export function AccountsTab() {
  useLocale();
  const { accounts, error: loadError, reload } = useAccounts();
  const capabilities = useCapabilities();
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [editing, setEditing] = useState<AccountSummary | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<AccountSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const serverList = await api.listServers();
        if (cancelled) return;
        setServers(serverList);
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
    return <PageState error={loadError ? t(`common.errors.codes.${errorCode(loadError)}`) : null} />;
  }

  return (
    <SettingsPage
      title={t("launcher.settings.accounts.title")}
      description={t("launcher.settings.accounts.description")}
      actions={
        <button
          className="play-btn flex items-center gap-2 rounded-[7px] px-4 py-2 text-[13px] font-semibold cursor-pointer"
          onClick={() => openModal(null)}
        >
          <i className="fa-solid fa-plus text-[11px]" />
          {t("launcher.settings.accounts.add")}
        </button>
      }
    >
      <SdkRequirement status={featureStatus(capabilities, "accounts")} />

      {groups.length === 0 ? (
        <button
          className="flex flex-col items-center gap-2.5 rounded-(--radius) border border-dashed border-(--border-strong) px-6 py-12 text-center transition-colors hover:border-(--muted-2) hover:bg-(--bg-card) cursor-pointer"
          onClick={() => openModal(null)}
        >
          <i className="fa-solid fa-user-shield text-[20px] text-(--muted-2)" />
          <span className="text-[13px] text-(--muted)">{t("launcher.settings.accounts.empty")}</span>
        </button>
      ) : null}

      {groups.map((group) => (
        <SettingsGroup
          key={group.realmlist}
          title={
            <span className="flex items-center gap-2">
              {group.server?.logo ? (
                <img src={group.server.logo} alt="" className="h-5 w-5 rounded object-contain" />
              ) : (
                <i className="fa-solid fa-server text-[12px] text-(--muted)" />
              )}
              {group.server?.name ?? group.realmlist}
            </span>
          }
          aside={<span className="text-[12px] text-(--muted-2)">{group.realmlist}</span>}
        >
          {group.accounts.map((account) => (
            <div key={account.id} className="flex flex-col gap-2.5 px-4.5 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-[13.5px] font-[550] text-(--text)">{accountName(account)}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-(--muted)">
                    {account.label.trim() ? (
                      <span className="flex items-center gap-1.5">
                        <i className="fa-solid fa-key text-[10px] text-(--muted-2)" />
                        {account.username}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1.5">
                      <i className="fa-solid fa-globe text-[10px] text-(--muted-2)" />
                      {account.default_realm || t("launcher.settings.accounts.noDefaultRealm")}
                    </span>
                    {account.default_character ? (
                      <span className="flex items-center gap-1.5">
                        <i className="fa-solid fa-user text-[10px] text-(--muted-2)" />
                        {account.default_character}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {account.has_password ? null : (
                    <span className="mr-1 rounded-md bg-(--warning)/10 px-2 py-0.5 text-[11px] font-semibold text-(--warning)">
                      {t("launcher.settings.accounts.noPassword")}
                    </span>
                  )}
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-[7px] text-(--muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text) cursor-pointer"
                    onClick={() => openModal(account)}
                    aria-label={t("common.edit")}
                  >
                    <i className="fa-solid fa-pen text-[11px]" />
                  </button>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-[7px] text-(--muted) transition-colors hover:bg-(--bg-hover) hover:text-(--danger) cursor-pointer"
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
                      className="flex items-baseline gap-1.5 rounded-md bg-(--bg-elevated) px-2 py-1 text-[11.5px]"
                      title={character.realm}
                    >
                      <span className="font-semibold text-(--text-soft)">{character.name}</span>
                      <span className="text-(--muted)">
                        {t("launcher.settings.accounts.level", { level: character.level })}{" "}
                        {t(`presence.races.${character.race_id}`)} {t(`presence.classes.${character.class_id}`)}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[12px] text-(--muted-2)">{t("launcher.settings.accounts.noCharacters")}</span>
              )}
            </div>
          ))}
        </SettingsGroup>
      ))}

      {error ? <span className="text-[12.5px] text-(--danger)">{error}</span> : null}

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
        destructive
        title={t("launcher.settings.accounts.confirmDelete")}
        description={t("launcher.settings.accounts.confirmDeleteDescription", { name: deleting ? accountName(deleting) : "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </SettingsPage>
  );
}
