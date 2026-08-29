import { useState } from "react";
import { api } from "@/services/api";
import { useGamesStore } from "@/store/gamesStore";
import { toDisplaySrc } from "@/utils/asset";
import type { Game } from "@/types/pywebview";
import { GamesView } from "./GamesView";

type View = "home" | "games" | "addons" | "settings";

const NAV_ITEMS: { key: View; icon: string; label: string }[] = [
  { key: "home", icon: "fa-solid fa-house", label: "Inicio" },
  { key: "games", icon: "fa-solid fa-gamepad", label: "Juegos" },
  { key: "addons", icon: "fa-solid fa-puzzle-piece", label: "Addons" },
  { key: "settings", icon: "fa-solid fa-gear", label: "Ajustes" },
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

interface SidebarProps {
  view: View;
  onSelect: (view: View) => void;
}

/** Left navigation rail. */
function Sidebar({ view, onSelect }: SidebarProps) {
  return (
    <aside className="flex w-16 flex-col items-center gap-2 border-r border-(--border) bg-(--bg-elevated) py-4">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          className={`flex h-10 w-10 items-center justify-center rounded-xl text-[15px] transition-colors ${
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
      <div className="mt-auto flex flex-col items-center gap-3 text-(--muted)">
        <span className="text-[10px] [writing-mode:vertical-rl]">Conectado</span>
        <i className="fa-brands fa-discord text-(--accent)" />
      </div>
    </aside>
  );
}

interface HomeStageProps {
  onGoGames: () => void;
}

/** Centered game stage shown when the home view is active. */
function HomeStage({ onGoGames }: HomeStageProps) {
  const games = useGamesStore((state) => state.games);
  const activeId = useGamesStore((state) => state.activeId);
  const setActive = useGamesStore((state) => state.setActive);

  if (games.length === 0) {
    return <EmptyState onAdd={onGoGames} />;
  }

  const active: Game | undefined =
    games.find((game) => game.id === activeId) ?? games[0];
  const dock = games.filter((game) => game.show_on_main);

  return (
    <div className="relative h-full w-full">
      <video
        key={active.bg_video}
        className="absolute inset-0 h-full w-full object-cover"
        src={toDisplaySrc(active.bg_video)}
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/45 to-black/55" />

      <div className="relative flex h-full flex-col items-center justify-center gap-6">
        <img
          src={toDisplaySrc(active.poster)}
          alt={active.name}
          className="h-40 object-contain drop-shadow-2xl"
        />
        <h1 className="text-3xl font-bold tracking-wide text-white drop-shadow">
          {active.name}
        </h1>
        <button className="play-btn text-lg" onClick={() => api.launchGame()}>
          <i className="fa-solid fa-play mr-2" /> Jugar
        </button>
      </div>

      {dock.length > 0 && (
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-3">
          {dock.map((game) => (
            <button
              key={game.id}
              className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border-2 transition-colors ${
                game.id === active.id
                  ? "border-(--accent)"
                  : "border-white/20 hover:border-white/60"
              }`}
              onClick={() => setActive(game.id)}
              title={game.name}
            >
              <img
                src={toDisplaySrc(game.icon)}
                alt={game.name}
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface EmptyStateProps {
  onAdd: () => void;
}

/** Shown on the home stage when there are no games yet. */
function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-(--bg)">
      <i className="fa-solid fa-gamepad text-5xl text-(--muted)" />
      <h1 className="text-2xl font-semibold text-(--text)">No hay juegos todavía</h1>
      <p className="max-w-sm text-center text-sm text-(--muted)">
        Añade tu instalación de World of Warcraft para empezar a jugar.
      </p>
      <button className="play-btn rounded-lg px-4 py-2" onClick={onAdd}>
        <i className="fa-solid fa-plus mr-1" /> Añadir juego
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
