import { useMemo, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/Modal";
import { accountRealms } from "@/hooks/useAccounts";
import { t } from "@/locales/i18n";
import { accountsApi, errorCode } from "@/services/api";
import type { AccountDraft, AccountSummary } from "@/types/domains/accounts";
import type { ServerEntry } from "@/types/domains/server";

interface AccountModalProps {
  open: boolean;
  /** Account to edit; `null` adds a new one. */
  account: AccountSummary | null;
  servers: ServerEntry[];
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY: AccountDraft = { realmlist: "", username: "", label: "", default_realm: "", default_character: "" };

/**
 * Add or edit a game account. The password is sent to the backend, stored in
 * the Windows Credential Manager and never read back.
 *
 * Mount it with a `key` per account so the form starts from that account.
 */
export function AccountModal({ open, account, servers, onClose, onSaved }: AccountModalProps) {
  const [form, setForm] = useState<AccountDraft>(() =>
    account
      ? {
          realmlist: account.realmlist,
          username: account.username,
          label: account.label,
          default_realm: account.default_realm,
          default_character: account.default_character,
        }
      : EMPTY,
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverOptions = useMemo<ComboboxOption[]>(
    () =>
      servers.flatMap((server) =>
        server.realmlists.map((realmlist) => ({
          value: realmlist,
          label: realmlist,
          sublabel: server.name,
          thumb: server.logo ?? undefined,
        })),
      ),
    [servers],
  );

  const realmOptions = useMemo<ComboboxOption[]>(() => {
    const server = servers.find((entry) => entry.realmlists.includes(form.realmlist.trim()));
    const known = account ? accountRealms(account) : [];
    return [...new Set([...(server?.realms ?? []), ...known])].map((realm) => ({ value: realm, label: realm }));
  }, [servers, form.realmlist, account]);

  const characterOptions = useMemo<ComboboxOption[]>(
    () =>
      (account?.characters ?? [])
        .filter((character) => !form.default_realm.trim() || character.realm === form.default_realm.trim())
        .map((character) => ({
          value: character.name,
          label: character.name,
          sublabel: `${t("launcher.settings.accounts.level", { level: character.level })} · ${t(`presence.classes.${character.class_id}`)}`,
        })),
    [account, form.default_realm],
  );

  const needsPassword = account === null || !account.has_password;
  const canSave =
    !busy && form.realmlist.trim() !== "" && form.username.trim() !== "" && (!needsPassword || password !== "");

  async function handleSave() {
    if (!canSave) return;
    setBusy(true);
    try {
      await accountsApi.saveAccount(account?.id ?? null, form, password);
      onSaved();
      onClose();
    } catch (e) {
      setError(t(`common.errors.codes.${errorCode(e)}`));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof AccountDraft) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal open={open} onClose={onClose} className="w-full max-w-md max-h-[88vh]">
      <ModalHeader
        icon="fa-solid fa-user-shield"
        title={account ? t("launcher.settings.accounts.edit") : t("launcher.settings.accounts.add")}
        subtitle={t("launcher.settings.accounts.passwordNote")}
        onClose={onClose}
      />
      <ModalBody className="gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="field-label">{t("launcher.settings.accounts.server")}</label>
          <Combobox
            value={form.realmlist}
            onChange={field("realmlist")}
            options={serverOptions}
            placeholder={t("launcher.settings.accounts.serverPlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="field-label">{t("launcher.settings.accounts.username")}</label>
          <input
            className="field-input"
            value={form.username}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => field("username")(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="field-label">{t("launcher.settings.accounts.password")}</label>
          <div className="relative">
            <input
              className="field-input pr-10"
              type={showPassword ? "text" : "password"}
              value={password}
              autoComplete="new-password"
              spellCheck={false}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={needsPassword ? "" : t("launcher.settings.accounts.passwordKeep")}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-(--muted) transition-colors hover:text-(--text) cursor-pointer"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? t("launcher.settings.accounts.hidePassword") : t("launcher.settings.accounts.showPassword")}
            >
              <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"} text-[12px]`} />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="field-label">{t("launcher.settings.accounts.label")}</label>
          <input
            className="field-input"
            value={form.label}
            onChange={(event) => field("label")(event.target.value)}
            placeholder={t("launcher.settings.accounts.labelPlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="field-label">{t("launcher.settings.accounts.defaultRealm")}</label>
          <Combobox
            value={form.default_realm}
            onChange={field("default_realm")}
            options={realmOptions}
            placeholder={t("launcher.settings.accounts.defaultRealmPlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="field-label">{t("launcher.settings.accounts.defaultCharacter")}</label>
          <Combobox
            value={form.default_character}
            onChange={field("default_character")}
            options={characterOptions}
            placeholder={t("launcher.settings.accounts.defaultCharacterPlaceholder")}
          />
        </div>
        {error ? <span className="text-[12px] text-(--danger)">{error}</span> : null}
      </ModalBody>
      <ModalFooter>
        <button className="ghost-btn rounded-lg px-4 py-2 text-[13px] cursor-pointer" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button
          className="play-btn rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-40 cursor-pointer"
          onClick={() => void handleSave()}
          disabled={!canSave}
        >
          {busy ? t("common.saving") : account ? t("common.save") : t("common.add")}
        </button>
      </ModalFooter>
    </Modal>
  );
}
