import { useState } from "react";
import { useGamesStore } from "@/store/gamesStore";
import type { Game } from "@/types/domains/game";
import { GameCard } from "./GameCard";
import { ShortcutModal } from "./ShortcutModal";
import { AddGameModal } from "./AddGameModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { t, useLocale } from "@/locales/i18n";

/**
 * Management view listing every saved game with add/edit/remove controls.
 */
export function GamesView() {
  useLocale();
  const games = useGamesStore((state) => state.games);
  const removeGame = useGamesStore((state) => state.removeGame);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Game | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Game | null>(null);
  const [shortcutGame, setShortcutGame] = useState<Game | null>(null);

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

  function handleRemove(id: string) {
    const game = games.find((g) => g.id === id) ?? null;
    setPendingRemove(game);
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    await removeGame(pendingRemove.id);
    setPendingRemove(null);
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-12 pt-12 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] leading-[1.15] font-[650] text-(--text)">{t("launcher.games.title")}</h1>
      </div>

      {games.length === 0 ? (
        <button
          className="flex w-full max-w-sm flex-col items-center gap-3 rounded-(--radius) border border-dashed border-(--border-strong) py-12 text-(--muted) transition-colors hover:border-(--muted-2) hover:bg-(--bg-card) hover:text-(--text) cursor-pointer"
          onClick={openCreate}
        >
          <i className="fa-solid fa-gamepad text-3xl" />
          <span className="text-sm">{t("launcher.games.empty")}</span>
        </button>
      ) : (
        <div className="flex flex-wrap gap-6">
          {games.map((game) => (
            <GameCard key={game.id} game={game} onEdit={openEdit} onRemove={handleRemove} onShortcut={setShortcutGame} />
          ))}
          <button
            className="flex h-53.75 w-37 flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-(--border-strong) text-(--muted) transition-colors hover:border-(--muted-2) hover:bg-(--bg-card) hover:text-(--text) cursor-pointer"
            onClick={openCreate}
          >
            <i className="fa-solid fa-plus text-2xl" />
            <span className="text-[13px]">{t("common.addGame")}</span>
          </button>
        </div>
      )}

      <AddGameModal open={modalOpen} initial={editing} onClose={() => setModalOpen(false)} />

      {shortcutGame ? <ShortcutModal key={shortcutGame.id} game={shortcutGame} onClose={() => setShortcutGame(null)} /> : null}

      <ConfirmDialog
        open={pendingRemove !== null}
        icon="fa-solid fa-trash"
        destructive
        title={t("common.confirmDeleteGame")}
        description={
          pendingRemove ? t("common.confirmDeleteGameDescription", { name: pendingRemove.name }) : ""
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}
