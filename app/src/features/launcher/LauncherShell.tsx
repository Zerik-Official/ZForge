import { useState } from "react";
import { Sidebar, type View } from "@/components/layout/Sidebar";
import { HomeStage } from "@/features/home/HomeStage";
import { GamesView } from "@/features/games/GamesView";
import { Placeholder } from "@/components/ui/Placeholder";
import { t, useLocale } from "@/locales/i18n";
import "@/styles/launcher.css";

export function LauncherShell() {
  useLocale();
  const [view, setView] = useState<View>("home");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-(--bg) text-(--text)">
      <Sidebar view={view} onSelect={setView} />
      <main className="flex-1 overflow-hidden">
        {view === "home" ? <HomeStage onGoGames={() => setView("games")} /> : null}
        {view === "games" ? <GamesView /> : null}
        {view === "addons" ? <Placeholder title={t("launcher.sidebar.addons")} /> : null}
        {view === "settings" ? <Placeholder title={t("launcher.sidebar.settings")}/> : null}
      </main>
    </div>
  );
}
