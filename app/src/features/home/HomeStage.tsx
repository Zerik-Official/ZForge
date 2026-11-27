import { useEffect, useEffectEvent, useState } from "react";
import { accountsApi, api, errorCode, sdkApi } from "@/services/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useGamesStore } from "@/store/gamesStore";
import { useLaunchRequestStore } from "@/store/launchRequestStore";
import { toDisplaySrc } from "@/utils/asset";
import type { Game } from "@/types/domains/game";
import { GameSettingsModal } from "@/features/game-settings/GameSettingsModal";
import { t, useLocale } from "@/locales/i18n";
import { TooltipSimple } from "@/components/ui/Tooltip";
import { useSession } from "@/hooks/useSession";
import { useAccounts } from "@/hooks/useAccounts";
import { featureStatus, useCapabilities } from "@/hooks/useCapabilities";
import type { LaunchChoice } from "@/types/domains/accounts";
import { EmptyState } from "./EmptyState";
import { HomeDock } from "./HomeDock";
import { LaunchSelector } from "./LaunchSelector";

const NO_CHOICE: LaunchChoice = { account_id: null, realm: "", character: "", headless: false };

interface HomeStageProps {
  onGoGames: () => void;
}

export function HomeStage({ onGoGames }: HomeStageProps) {
  useLocale();
  const games = useGamesStore((state) => state.games);
  const activeId = useGamesStore((state) => state.activeId);
  const setActive = useGamesStore((state) => state.setActive);
  const reorderDock = useGamesStore((state) => state.reorderDock);
  const session = useSession();
  const [requesting, setRequesting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [integrityPrompt, setIntegrityPrompt] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<{ gameId: string; choice: LaunchChoice } | null>(null);
  const { accounts } = useAccounts();
  const capabilities = useCapabilities();
  const accountsFeature = featureStatus(capabilities, "accounts");
  const hiddenStartFeature = featureStatus(capabilities, "hidden_start");
  const [choice, setChoice] = useState<LaunchChoice>(NO_CHOICE);
  const [launchError, setLaunchError] = useState<{ gameId: string; text: string } | null>(null);

  const activeGameId = (games.find((game) => game.id === activeId) ?? games[0])?.id ?? null;

  useEffect(() => {
    if (!activeGameId) return;
    let cancelled = false;
    accountsApi
      .getLaunchChoice(activeGameId)
      .then((saved) => {
        if (!cancelled) setChoice(saved);
      })
      .catch((error: unknown) => console.error("Could not read the launch choice", error));
    return () => {
      cancelled = true;
    };
  }, [activeGameId]);

  /** Keep the account only when it exists and the SDK can log in with it. */
  function usableChoice(wanted: LaunchChoice): LaunchChoice {
    const known = accounts?.some((account) => account.id === wanted.account_id) ?? false;
    return known && accountsFeature?.available !== false
      ? { ...wanted, headless: wanted.headless && hiddenStartFeature?.available !== false }
      : NO_CHOICE;
  }

  async function startGame(gameId: string, wanted: LaunchChoice) {
    setLastAttempt({ gameId, choice: wanted });
    setRequesting(true);
    setLaunchError(null);
    try {
      await api.launchGame(gameId, wanted);
    } catch (error) {
      if (errorCode(error) === "sdk_integrity_mismatch") {
        setIntegrityPrompt(true);
        return;
      }
      console.error("Could not launch the game", error);
      setLaunchError({ gameId, text: t(`common.errors.codes.${errorCode(error)}`) });
    } finally {
      setRequesting(false);
    }
  }

  // A shortcut that launches its game: start it once the game is selected and the
  // accounts and SDK features are known, with the shortcut account or the saved choice.
  const launchRequest = useLaunchRequestStore((state) => state.request);
  const takeLaunchRequest = useLaunchRequestStore((state) => state.take);
  const runLaunchRequest = useEffectEvent(async () => {
    const request = takeLaunchRequest();
    if (!request) return;
    if (session !== null && session.phase !== "idle") return;
    const wanted: LaunchChoice = request.account_id
      ? {
          account_id: request.account_id,
          realm: request.realm ?? "",
          character: request.character ?? "",
          headless: request.headless,
        }
      : await accountsApi.getLaunchChoice(request.game_id).catch(() => NO_CHOICE);
    await startGame(request.game_id, usableChoice(wanted));
  });
  const launchReady =
    launchRequest !== null && activeGameId === launchRequest.game_id && accounts !== null && capabilities !== null;
  useEffect(() => {
    if (!launchReady) return;
    const timer = setTimeout(() => void runLaunchRequest(), 0);
    return () => clearTimeout(timer);
  }, [launchReady]);

  if (games.length === 0) {
    return <EmptyState onAdd={onGoGames} />;
  }

  const active: Game = games.find((game) => game.id === activeId) ?? games[0];

  const sessionActive = session !== null && session.phase !== "idle";
  const launching = requesting || sessionActive;

  const launchChoice = usableChoice(choice);
  const loginError = session?.game_id === active.id ? session.login_error : null;
  const errorText = loginError
    ? t(`session.loginErrors.${loginError}`)
    : launchError?.gameId === active.id
      ? launchError.text
      : null;

  async function handlePlay() {
    if (launching) return;
    await startGame(active.id, launchChoice);
  }

  const dock = games.filter((game) => game.show_on_main);

  return (
    <div className="relative h-full w-full overflow-hidden bg-(--bg)">
      <video
        key={active.bg_video}
        className="absolute inset-0 h-full w-full object-cover"
        src={toDisplaySrc(active.bg_video)}
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg)_45%,transparent)_0%,transparent_26%,transparent_58%,color-mix(in_srgb,var(--bg)_75%,transparent)_84%,var(--bg)_100%),linear-gradient(90deg,color-mix(in_srgb,var(--bg)_50%,transparent)_0%,transparent_36%)]" />

      <img
        src={toDisplaySrc(active.poster)}
        alt={active.name}
        className="absolute top-12 left-10 h-37.5 w-85 object-contain object-center drop-shadow-[0_10px_24px_rgba(0,0,0,0.6)]"
        draggable={false}
      />

      {errorText ? (
        <div className="absolute right-12 bottom-25 flex max-w-100 items-start gap-2.5 rounded-(--radius) border border-(--danger)/30 bg-(--bg-elevated)/90 px-3.5 py-2.5 text-[12.5px] text-(--danger) backdrop-blur-md" role="alert">
          <i className="fa-solid fa-circle-exclamation mt-0.5 text-[12px]" />
          <span>{errorText}</span>
        </div>
      ) : null}

      <div className="absolute inset-x-12 bottom-8 flex items-center gap-3">
        <LaunchSelector
          accounts={accounts ?? []}
          choice={launchChoice}
          onChange={setChoice}
          accountsFeature={accountsFeature}
          hiddenStartFeature={hiddenStartFeature}
          disabled={launching}
        />
        <button
          disabled={launching}
          onClick={handlePlay}
          className={`flex h-13 items-center gap-3 rounded-(--radius) bg-(--primary) px-9 text-[16px] font-[650] text-(--on-primary) transition-colors [font-stretch:118%] hover:bg-(--primary-hover) active:bg-(--primary-active) disabled:cursor-not-allowed disabled:opacity-75 ${launching ? "cursor-wait" : "cursor-pointer"}`}
        >
          {launching ? <i className="fa-solid fa-spinner fa-spin text-[13px]" /> : <i className="fa-solid fa-play text-[13px]" />}
          {sessionActive ? t(`session.phase.${session.phase}`) : launching ? t("common.playing") : t("common.play")}
        </button>
        <TooltipSimple content={t("common.gameSettings")} side="top" align="center">
          <button
            className="flex h-13 w-13 items-center justify-center rounded-(--radius) border border-(--border-strong) bg-(--bg-card)/90 text-(--text-soft) backdrop-blur-md transition-colors hover:bg-(--bg-elevated) hover:text-(--text) cursor-pointer"
            onClick={() => setSettingsOpen(true)}
            aria-label={t("common.gameSettings")}
          >
            <i className="fa-solid fa-gear text-[16px]" />
          </button>
        </TooltipSimple>

        <HomeDock dock={dock} activeId={active.id} onSelect={setActive} onReorder={reorderDock} />
      </div>

      <GameSettingsModal open={settingsOpen} game={active} onClose={() => setSettingsOpen(false)} />
      <ConfirmDialog
        open={integrityPrompt}
        destructive
        icon="fa-solid fa-shield-halved"
        title={t("home.integrity.title")}
        description={t("home.integrity.description")}
        confirmLabel={t("home.integrity.useAnyway")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setIntegrityPrompt(false)}
        onConfirm={() => {
          setIntegrityPrompt(false);
          sdkApi
            .trustSdk()
            .then(() => (lastAttempt ? startGame(lastAttempt.gameId, lastAttempt.choice) : handlePlay()))
            .catch((error: unknown) =>
              setLaunchError({ gameId: active.id, text: t(`common.errors.codes.${errorCode(error)}`) }),
            );
        }}
      />
    </div>
  );
}
