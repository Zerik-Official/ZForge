import { useState } from "react";
import { api } from "@/services/api";
import { useGamesStore } from "@/store/gamesStore";
import { toDisplaySrc } from "@/utils/asset";
import type { Game } from "@/types/pywebview";
import { GamesView } from "./GamesView";
import { GameSettingsModal } from "./GameSettingsModal";
import "@/styles/launcher.css";

interface EmptyStateProps {
  onAdd: () => void;
}

interface SidebarProps {
  view: View;
  onSelect: (view: View) => void;
}

interface HomeStageProps {
  onGoGames: () => void;
}

type View = "home" | "games" | "addons" | "settings";

const NAV_ITEMS: { key: View; icon: string; label: string }[] = [
  { key: "home", icon: "fa-solid fa-house", label: "Inicio" },
  { key: "games", icon: "fa-solid fa-gamepad", label: "Juegos" },
  { key: "addons", icon: "fa-solid fa-puzzle-piece", label: "Addons" },
];

/**
 * Main post-splash screen: a sidebar plus a content area that switches
 * between the home stage and the games management view.
 */
export function LauncherView() {
  const [view, setView] = useState<View>("home");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-(--bg) text-(--text)">
      <Sidebar view={view} onSelect={setView} />
      <main className="flex-1 overflow-hidden">
        {view === "home" ? <HomeStage onGoGames={() => setView("games")} /> : null}
        {view === "games" ? <GamesView /> : null}
        {view === "addons" ? <Placeholder title="Addons" /> : null}
        {view === "settings" ? <Placeholder title="Ajustes" /> : null}
      </main>
    </div>
  );
}

/** Left navigation rail. */
function Sidebar({ view, onSelect }: SidebarProps) {
  return (
    <aside className="flex h-full w-16 flex-col items-center gap-2 border-r border-(--border) bg-(--bg-elevated) py-4">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          className={`flex h-10 w-10 items-center justify-center rounded-xl text-[15px] transition-colors cursor-pointer ${
            view === item.key
              ? "bg-(--accent)/15 text-(--accent)"
              : "text-(--muted) hover:text-(--text)"
          }`}
          onClick={() => onSelect(item.key)}
          title={item.label}
        >
          <i className={item.icon} />
        </button>
      ))}
      <div className="mt-auto flex w-full flex-col items-center gap-2 border-t border-(--border) px-2 pt-3 pb-8">
        <button
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[15px] transition-colors cursor-pointer ${
            view === "settings" ? "bg-(--accent)/15 text-(--accent)" : "text-(--muted) hover:text-(--text)"
          }`}
          onClick={() => onSelect("settings")}
          title="Ajustes"
        >
          <i className="fa-solid fa-gear" />
        </button>
      </div>
    </aside>
  );
}

/**
 *  The home stage is the default view of the launcher, showing a background video and
 *  a dock of games that are marked to be shown on the main screen.
 * @param onGoGames Callback to switch to the games management view.
 * @returns The home stage component.
 */
function HomeStage({ onGoGames }: HomeStageProps) {
  const games = useGamesStore((state) => state.games);
  const activeId = useGamesStore((state) => state.activeId);
  const setActive = useGamesStore((state) => state.setActive);
  const reorderDock = useGamesStore((state) => state.reorderDock);
  const [launching, setLaunching] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  if (games.length === 0) {
    return <EmptyState onAdd={onGoGames} />;
  }

  const active: Game = games.find((game) => game.id === activeId) ?? games[0];

  async function handlePlay() {
    if (launching) return;
    setLaunching(true);
    await api.launchGame(active.id);
    window.setTimeout(() => setLaunching(false), 4000);
  }
  const dock = games.filter((game) => game.show_on_main);
  const canReorder = dock.length > 1;

  function handleDragStart(event: React.DragEvent, id: string) {
    if (!canReorder) return;
    setDraggedId(id);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event: React.DragEvent, targetId: string) {
    event.preventDefault();
    if (!draggedId || draggedId === targetId || !canReorder) return;
    const fromIdx = dock.findIndex((g) => g.id === draggedId);
    const toIdx = dock.findIndex((g) => g.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...dock];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    void reorderDock(next.map((g) => g.id));
    setDraggedId(null);
  }

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

      <div className="absolute bottom-15 right-6 flex items-center gap-2 rounded-2xl border border-(--border-strong) bg-(--bg-elevated)/70 p-2.5 shadow-2xl backdrop-blur-xl">
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
          {launching ? "Lanzando..." : "Jugar"}
        </button>
        <button className="flex h-11 w-11 items-center justify-center rounded-xl border border-(--border-strong) bg-(--bg-elevated) text-(--text-soft) transition-all duration-150 hover:rotate-20 hover:border-(--primary) hover:bg-(--bg-hover) cursor-pointer"
        onClick={() => setSettingsOpen(true)}
        title="Configuración del juego"
        >
          <i className="fa-solid fa-gear text-[15px] cursor-pointer" />
        </button>
      </div>

      <GameSettingsModal open={settingsOpen} game={active} onClose={() => setSettingsOpen(false)} />

      {dock.length > 0 && (
        <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 items-end gap-3 rounded-2xl border border-(--border-strong) bg-(--bg-elevated)/70 p-2.5 shadow-2xl backdrop-blur-xl">
          {dock.map((game) => (
            <button
              key={game.id}
              draggable={canReorder}
              onDragStart={(event) => handleDragStart(event, game.id)}
              onDragOver={handleDragOver}
              onDrop={(event) => handleDrop(event, game.id)}
              onDragEnd={() => setDraggedId(null)}
              className={`group relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border bg-[linear-gradient(160deg,var(--bg-elevated),var(--bg-card))] transition-transform duration-200 hover:-translate-y-2.5 hover:scale-110 hover:shadow-[0_10px_24px_rgba(0,0,0,0.4),0_0_0_1px_var(--accent-glow)] ${
                canReorder ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
              } ${draggedId === game.id ? "opacity-40 scale-95" : ""} ${
                game.id === active.id ? "border-(--accent)" : "border-(--border-strong)"
              }`}
              onClick={() => setActive(game.id)}
            >
              <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-(--border-strong) bg-(--bg-elevated) px-2.5 py-1 text-[11px] font-medium text-(--text-soft) opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                {game.name}
              </span>
              <img src={toDisplaySrc(game.icon)} alt={game.name} className="h-8 w-8 object-contain" />
              {game.id === active.id && (
                <span className="absolute -bottom-2.25 h-1 w-1 rounded-full bg-(--accent) shadow-[0_0_6px_var(--accent-glow)]" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


/** Shown on the home stage when there are no games yet. */
function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-(--bg)">
      <div className="flex h-19 w-19 items-center justify-center rounded-2xl border border-(--border-strong) bg-(--bg-card)">
        <i className="fa-solid fa-gamepad text-2xl text-(--muted-2)" />
      </div>
      <div className="flex max-w-sm flex-col items-center gap-1.5 text-center">
        <h1 className="text-[16px] font-semibold text-(--text)">No tienes ningún juego añadido</h1>
        <p className="text-[13px] leading-relaxed text-(--muted)">
          Añade tu instalación de World of Warcraft para empezar a jugar, verificar archivos e instalar addons.
        </p>
      </div>
      <button
        className="flex items-center gap-2 rounded-lg bg-[linear-gradient(160deg,var(--primary-hover),var(--primary-active))] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_0_30px_var(--primary-glow),0_6px_20px_rgba(0,0,0,0.35)] transition-[transform,filter] duration-150 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 cursor-pointer"
        onClick={onAdd}
      >
        <i className="fa-solid fa-plus text-[12px]" />
        Añadir juego
      </button>
    </div>
  );
}

/** Placeholder for not-yet-implemented tabs. */
function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-(--bg) text-(--muted)">
      <span className="text-lg">{title} — próximamente</span>
    </div>
  );
}
