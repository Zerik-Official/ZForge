import { useCallback, useEffect, useState } from "react";
import { Sidebar, type SidebarWidth, type View } from "@/components/layout/Sidebar";
import { TooltipSimple } from "@/components/ui/Tooltip";
import { HomeStage } from "@/features/home/HomeStage";
import { GamesView } from "@/features/games/GamesView";
import { AddonsView } from "@/features/addons/AddonsView";
import { LauncherSettingsView, type LauncherSettingsTab } from "@/features/launcher-settings/LauncherSettingsView";
import { t, useLocale } from "@/locales/i18n";
import { systemApi } from "@/services/api";
import { onShortcutAction, subscribe } from "@/services/api/events";
import { useGamesStore } from "@/store/gamesStore";
import { useLaunchRequestStore } from "@/store/launchRequestStore";
import type { ShortcutAction } from "@/types/domains/system";
import "@/styles/launcher.css";

const SIDEBAR_KEY = "zforge.sidebar";

interface SidebarState {
  width: SidebarWidth;
  hidden: boolean;
}

function readSidebar(): SidebarState {
  try {
    const saved = JSON.parse(localStorage.getItem(SIDEBAR_KEY) ?? "null") as Partial<SidebarState> | null;
    return {
      width: saved?.width === "collapsed" ? "collapsed" : "expanded",
      hidden: saved?.hidden === true,
    };
  } catch {
    return { width: "expanded", hidden: false };
  }
}

function saveSidebar(state: SidebarState) {
  try {
    localStorage.setItem(SIDEBAR_KEY, JSON.stringify(state));
  } catch {
    // The preference is a convenience; losing it only resets the sidebar next time.
  }
}

export function LauncherShell() {
  useLocale();
  const [view, setView] = useState<View>("home");
  const [settingsTab, setSettingsTab] = useState<LauncherSettingsTab>("general");
  const [sidebar, setSidebar] = useState<SidebarState>(readSidebar);
  // The sidebar is clipped only while it slides in or out, so the settings menu of the
  // collapsed rail can open beside it the rest of the time.
  const [sliding, setSliding] = useState(false);
  const [lastHidden, setLastHidden] = useState(sidebar.hidden);
  if (lastHidden !== sidebar.hidden) {
    setLastHidden(sidebar.hidden);
    setSliding(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  const updateSidebar = useCallback((change: (state: SidebarState) => SidebarState) => {
    setSidebar((current) => {
      const next = change(current);
      saveSidebar(next);
      return next;
    });
  }, []);

  const setActive = useGamesStore((state) => state.setActive);
  const requestLaunch = useLaunchRequestStore((state) => state.requestLaunch);

  // A game shortcut selects its game on Home and, when it says so, launches it: the one the
  // launcher was started with, and any opened later while it runs.
  useEffect(() => {
    function follow(action: ShortcutAction) {
      setView("home");
      void setActive(action.game_id);
      if (action.launch) requestLaunch(action);
    }
    const unsubscribe = subscribe(onShortcutAction(follow));
    systemApi
      .takeShortcutAction()
      .then((action) => {
        if (action) follow(action);
      })
      .catch((error: unknown) => console.error("Could not read the shortcut action", error));
    return unsubscribe;
  }, [setActive, requestLaunch]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        updateSidebar((state) => ({ ...state, hidden: !state.hidden }));
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [updateSidebar]);

  function openSettings(tab: LauncherSettingsTab) {
    setSettingsTab(tab);
    setView("settings");
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-(--bg) text-(--text)">
      {sidebar.hidden ? (
        <TooltipSimple content={`${t("launcher.sidebar.show")} (Ctrl+B)`} side="right" align="center">
          <button
            className="fixed top-1.5 left-2 z-61 flex h-7 w-8.5 items-center justify-center rounded-md text-[12px] text-(--muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text) cursor-pointer animate-[fadeIn_0.2s_ease_0.12s_both]"
            onClick={() => updateSidebar((state) => ({ ...state, hidden: false }))}
            aria-label={t("launcher.sidebar.show")}
          >
            <i className="fa-solid fa-bars" />
          </button>
        </TooltipSimple>
      ) : null}
      <div
        className={`relative z-30 h-full shrink-0 transition-[width] duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none ${
          sidebar.hidden ? "w-0" : sidebar.width === "collapsed" ? "w-16" : "w-58"
        } ${sliding || sidebar.hidden ? "overflow-hidden" : ""}`}
        inert={sidebar.hidden}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === "width") setSliding(false);
        }}
      >
        <div
          className={`h-full w-fit transition-[translate,opacity] duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none ${
            sidebar.hidden ? "-translate-x-6 opacity-0" : "translate-x-0 opacity-100"
          }`}
        >
          <Sidebar
            view={view}
            settingsTab={settingsTab}
            width={sidebar.width}
            onSelect={setView}
            onSelectSettings={openSettings}
            onToggleWidth={() =>
              updateSidebar((state) => ({ ...state, width: state.width === "expanded" ? "collapsed" : "expanded" }))
            }
            onHide={() => updateSidebar((state) => ({ ...state, hidden: true }))}
          />
        </div>
      </div>
      <main className="relative min-w-0 flex-1 overflow-hidden">
        <div
          data-tauri-drag-region
          className="window-drag-strip absolute inset-x-0 top-0 z-10 h-10"
        />
        {view === "home" ? <HomeStage onGoGames={() => setView("games")} /> : null}
        {view === "games" ? <GamesView /> : null}
        {view === "addons" ? <AddonsView /> : null}
        {view === "settings" ? <LauncherSettingsView tab={settingsTab} /> : null}
      </main>
    </div>
  );
}
