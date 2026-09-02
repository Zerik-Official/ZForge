import { useState } from "react";
import { useGamesStore } from "@/store/gamesStore";
import type { Game } from "@/types/pywebview";
import { GameCard } from "./GameCard";
import { AddGameModal } from "./AddGameModal";
import { t } from "@/locales/i18n";

/**
 * Management view listing every saved game with add/edit/remove controls.
 */
export function GamesView() {
  const games = useGamesStore((state) => state.games);
  const removeGame = useGamesStore((state) => state.removeGame);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Game | null>(null);

  /** Open the modal to create a new game. */
  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  /** Open the modal to edit an existing game. */
  function openEdit(game: Game) {
    setEditing(game);
    setModalOpen(true);
  }

  /** Confirm and delete a game. */
  async function handleRemove(id: string) {
    if (!window.confirm(t("common.confirmDeleteGame"))) return;
    await removeGame(id);
  }

  return (
    <div className="flex h-full flex-col gap-5 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-(--text)">{t("launcher.games.title")}</h1>
      </div>

      {games.length === 0 ? (
        <button
          className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-dashed border-(--border-strong) bg-(--bg-card) py-12 text-(--muted) transition-colors hover:border-(--accent) hover:text-(--text) cursor-pointer"
          onClick={openCreate}
        >
          <i className="fa-solid fa-gamepad text-3xl" />
          <span className="text-sm">{t("launcher.games.empty")}</span>
        </button>
      ) : (
        <div className="flex flex-wrap gap-6">
          {games.map((game) => (
            <GameCard key={game.id} game={game} onEdit={openEdit} onRemove={handleRemove} />
          ))}
          <button
            className="flex h-53.75 w-37 flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-(--border-strong) bg-(--bg-card) text-(--muted) transition-colors hover:border-(--accent) hover:text-(--text) cursor-pointer"
            onClick={openCreate}
          >
            <i className="fa-solid fa-plus text-2xl" />
            <span className="text-[12px]">{t("common.add")}</span>
          </button>
        </div>
      )}

      <AddGameModal open={modalOpen} initial={editing} onClose={() => setModalOpen(false)} />
    </div>
  );
}
