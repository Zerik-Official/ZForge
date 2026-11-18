import { useEffect, useState } from "react";
import { accountsApi, api, errorCode } from "@/services/api";
import { useGamesStore } from "@/store/gamesStore";
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

  if (games.length === 0) {
    return <EmptyState onAdd={onGoGames} />;
  }

  const active: Game = games.find((game) => game.id === activeId) ?? games[0];

  const sessionActive = session !== null && session.phase !== "idle";
  const launching = requesting || sessionActive;

  const knownAccount = accounts?.some((account) => account.id === choice.account_id) ?? false;
  const launchChoice: LaunchChoice =
    knownAccount && accountsFeature?.available !== false
      ? { ...choice, headless: choice.headless && hiddenStartFeature?.available !== false }
      : NO_CHOICE;
  const loginError = session?.game_id === active.id ? session.login_error : null;
  const errorText = loginError
    ? t(`session.loginErrors.${loginError}`)
    : launchError?.gameId === active.id
      ? launchError.text
      : null;

  async function handlePlay() {
    if (launching) return;
    setRequesting(true);
    setLaunchError(null);
    try {
      await api.launchGame(active.id, launchChoice);
    } catch (error) {
      console.error("Could not launch the game", error);
      setLaunchError({ gameId: active.id, text: t(`common.errors.codes.${errorCode(error)}`) });
    } finally {
      setRequesting(false);
    }
  }

  const dock = games.filter((game) => game.show_on_main);

  return (
    <div className="relative h-full w-full overflow-hidden bg-(--bg)">
      <video
        key={active.bg_video}
        className="absolute inset-0 h-full w-full object-cover opacity-90"
        src={toDisplaySrc(active.bg_video)}
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,11,0.35)_0%,rgba(7,7,11,0.15)_40%,rgba(7,7,11,0.55)_78%,rgba(7,7,11,0.92)_100%),linear-gradient(90deg,rgba(7,7,11,0.55)_0%,transparent_35%)]" />

      <div className="absolute right-6 top-6 h-22.5 w-47.5 overflow-hidden rounded-xl drop-shadow-[0_12px_26px_rgba(0,0,0,0.55)]">
        <img src={toDisplaySrc(active.poster)} alt={active.name} className="h-full w-full rounded-xl object-cover" />
      </div>

      {errorText ? (
        <div className="absolute bottom-34 right-6 flex max-w-90 items-start gap-2 rounded-xl border border-(--danger)/30 bg-(--bg-elevated)/85 px-3.5 py-2.5 text-[11.5px] text-(--danger) shadow-xl backdrop-blur-xl">
          <i className="fa-solid fa-circle-exclamation mt-0.5 text-[12px]" />
          <span>{errorText}</span>
        </div>
      ) : null}

      <div className="absolute bottom-15 right-6 flex items-center gap-2 rounded-2xl border border-(--border-strong) bg-(--bg-elevated)/70 p-2.5 shadow-2xl backdrop-blur-xl">
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
          className={`flex items-center gap-2.5 rounded-xl bg-[linear-gradient(160deg,var(--primary-hover),var(--primary-active))] px-6 py-3 text-[13.5px] font-bold text-white shadow-[0_0_30px_var(--primary-glow),0_6px_20px_rgba(0,0,0,0.35)] transition-[transform,filter] duration-150 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:brightness-100 ${launching ? "cursor-wait" : "cursor-pointer"}`}
        >
          {launching ? (
            <i className="fa-solid fa-spinner fa-spin text-[12px]" />
          ) : (
            <i className="fa-solid fa-play text-[12px] cursor-pointer" />
          )}
          {sessionActive ? t(`session.phase.${session.phase}`) : launching ? t("common.playing") : t("common.play")}
        </button>
        <TooltipSimple content={t("common.gameSettings")} side="top" align="center">
          <button
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-(--border-strong) bg-(--bg-elevated) text-(--text-soft) transition-all duration-150 hover:rotate-20 hover:border-(--primary) hover:bg-(--bg-hover) cursor-pointer"
            onClick={() => setSettingsOpen(true)}
          >
            <i className="fa-solid fa-gear text-[15px] cursor-pointer" />
          </button>
        </TooltipSimple>
      </div>

      <GameSettingsModal open={settingsOpen} game={active} onClose={() => setSettingsOpen(false)} />

      <HomeDock dock={dock} activeId={active.id} onSelect={setActive} onReorder={reorderDock} />
    </div>
  );
}