import { useMemo, useState } from "react";
import { Notice } from "@/components/layout/Notice";
import { SdkRequirement } from "@/components/sdk/SdkRequirement";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/Modal";
import { Select, type SelectOption } from "@/components/ui/Select";
import { accountName, accountRealms, useAccounts } from "@/hooks/useAccounts";
import { featureStatus, useCapabilities } from "@/hooks/useCapabilities";
import { t, useLocale } from "@/locales/i18n";
import { errorCode, systemApi } from "@/services/api";
import type { Game } from "@/types/domains/game";
import type { ShortcutAction } from "@/types/domains/system";

/** Account option that keeps the last choice saved for the game. */
const LAST_CHOICE = "";
/** Character option that stops at the character list. */
const CHARACTER_SELECT = "";

type ShortcutMode = "open" | "launch";

interface ShortcutModalProps {
  game: Game | null;
  onClose: () => void;
}

/**
 * Create a desktop shortcut for a game: open the launcher on it, or launch it with the
 * last choice or with a given account, realm and character.
 */
export function ShortcutModal({ game, onClose }: ShortcutModalProps) {
  useLocale();
  const { accounts } = useAccounts();
  const capabilities = useCapabilities();
  const accountsFeature = featureStatus(capabilities, "accounts");
  const hiddenStartFeature = featureStatus(capabilities, "hidden_start");
  const [mode, setMode] = useState<ShortcutMode>("open");
  const [accountId, setAccountId] = useState(LAST_CHOICE);
  const [realm, setRealm] = useState("");
  const [character, setCharacter] = useState(CHARACTER_SELECT);
  const [headless, setHeadless] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const account = accounts?.find((entry) => entry.id === accountId) ?? null;

  const modeOptions: SelectOption[] = (["open", "launch"] as ShortcutMode[]).map((value) => ({
    value,
    label: t(`launcher.shortcut.modes.${value}`),
  }));

  const accountOptions = useMemo<SelectOption[]>(
    () => [
      { value: LAST_CHOICE, label: t("launcher.shortcut.lastChoice") },
      ...(accounts ?? []).map((entry) => ({ value: entry.id, label: `${accountName(entry)} (${entry.realmlist})` })),
    ],
    [accounts],
  );

  const realmOptions = useMemo<SelectOption[]>(
    () => (account ? accountRealms(account).map((name) => ({ value: name, label: name })) : []),
    [account],
  );

  const characterOptions = useMemo<SelectOption[]>(() => {
    const characters = (account?.characters ?? []).filter((entry) => !realm || entry.realm === realm);
    return [
      { value: CHARACTER_SELECT, label: t("home.launch.stayInCharacterSelect") },
      ...characters.map((entry) => ({
        value: entry.name,
        label: `${entry.name}, ${t("launcher.settings.accounts.level", { level: entry.level })}`,
      })),
    ];
  }, [account, realm]);

  function pickAccount(id: string) {
    const next = accounts?.find((entry) => entry.id === id) ?? null;
    setAccountId(id);
    setRealm(next?.default_realm ?? "");
    setCharacter(next?.default_character ?? CHARACTER_SELECT);
    setHeadless(false);
  }

  async function create() {
    if (!game) return;
    const action: ShortcutAction = {
      game_id: game.id,
      launch: mode === "launch",
      account_id: mode === "launch" && account ? account.id : null,
      realm: mode === "launch" && account && realm ? realm : null,
      character: mode === "launch" && account && character ? character : null,
      headless: mode === "launch" && account !== null && character !== "" && headless,
    };
    setBusy(true);
    setError(null);
    try {
      setCreated(await systemApi.createGameShortcut(action));
    } catch (e) {
      setError(t(`common.errors.codes.${errorCode(e)}`));
    } finally {
      setBusy(false);
    }
  }

  const canUseAccounts = accountsFeature?.available !== false;

  return (
    <Modal open={game !== null} onClose={onClose} className="w-full max-w-lg">
      <ModalHeader
        icon="fa-solid fa-share-from-square"
        title={t("launcher.shortcut.title")}
        subtitle={game ? t("launcher.shortcut.subtitle", { name: game.name }) : undefined}
        onClose={onClose}
      />
      <ModalBody className="gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="field-label">{t("launcher.shortcut.mode")}</label>
          <Select value={mode} options={modeOptions} onChange={(value) => setMode(value as ShortcutMode)} />
          <span className="text-[12.5px] text-(--muted)">{t(`launcher.shortcut.modeDescriptions.${mode}`)}</span>
        </div>

        {mode === "launch" ? (
          canUseAccounts ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="field-label">{t("home.launch.account")}</label>
                <Select value={accountId} options={accountOptions} onChange={pickAccount} />
              </div>
              {account ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="field-label">{t("home.launch.realm")}</label>
                    <Select
                      value={realm}
                      options={realmOptions}
                      onChange={(value) => {
                        setRealm(value);
                        setCharacter(CHARACTER_SELECT);
                      }}
                      placeholder={t("home.launch.realmPlaceholder")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="field-label">{t("home.launch.character")}</label>
                    <Select value={character} options={characterOptions} onChange={setCharacter} />
                  </div>
                </div>
              ) : null}
              {account ? (
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={headless}
                    onChange={setHeadless}
                    label={t("home.launch.headless")}
                    description={t("home.launch.headlessDescription")}
                    disabled={character === CHARACTER_SELECT || hiddenStartFeature?.available === false}
                  />
                  <SdkRequirement status={hiddenStartFeature} variant="badge" />
                </div>
              ) : null}
            </>
          ) : (
            <SdkRequirement status={accountsFeature} />
          )
        ) : null}

        {created ? (
          <Notice
            tone="info"
            icon="fa-solid fa-circle-check"
            title={t("launcher.shortcut.created")}
            description={<span className="break-all">{created}</span>}
          />
        ) : null}
        {error ? <span className="text-[12.5px] text-(--danger)">{error}</span> : null}
      </ModalBody>
      <ModalFooter>
        <button className="ghost-btn rounded-[7px] px-4 py-2 text-[13px] cursor-pointer" onClick={onClose}>
          {created ? t("common.close") : t("common.cancel")}
        </button>
        <button
          className="play-btn flex items-center gap-2 rounded-[7px] px-4 py-2 text-[13px] font-semibold disabled:opacity-50 cursor-pointer"
          onClick={() => void create()}
          disabled={busy || game === null}
        >
          {busy ? <i className="fa-solid fa-spinner fa-spin text-[11px]" /> : <i className="fa-solid fa-desktop text-[11px]" />}
          {created ? t("launcher.shortcut.createAgain") : t("launcher.shortcut.create")}
        </button>
      </ModalFooter>
    </Modal>
  );
}
