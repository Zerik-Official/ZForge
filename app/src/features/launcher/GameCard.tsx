import type { Game } from "@/types/pywebview";
import { toDisplaySrc } from "@/utils/asset";

interface GameCardProps {
  /** Game represented by this card. */
  game: Game;
  /** Called when the user requests to edit the game. */
  onEdit: (game: Game) => void;
  /** Called when the user requests to remove the game. */
  onRemove: (id: string) => void;
}

/**
 * Visual card for a single saved game inside the Games management view.
 */
export function GameCard({ game, onEdit, onRemove }: GameCardProps) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-(--border-strong) bg-(--bg-card) transition-colors hover:border-(--accent)"
      style={{ width: 200 }}
    >
      <button
        className="flex h-28 w-full items-center justify-center bg-(--bg-elevated)"
        onClick={() => onEdit(game)}
        title="Editar"
      >
        <img
          src={toDisplaySrc(game.poster || game.icon)}
          alt={game.name}
          className="h-full w-full object-cover opacity-90"
        />
      </button>

      <div className="flex flex-col gap-1 p-3">
        <span className="truncate text-[13px] font-semibold text-(--text)">
          {game.name}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-(--muted)">
          {game.expansion}
          {game.show_on_main ? " · en inicio" : ""}
        </span>
      </div>

      <div className="flex items-center gap-2 border-t border-(--border) px-3 py-2">
        <button
          className="ghost-btn flex-1 rounded-lg py-1.5 text-[12px]"
          onClick={() => onEdit(game)}
        >
          Editar
        </button>
        <button
          className="ghost-btn rounded-lg px-3 py-1.5 text-[12px] text-(--danger)"
          onClick={() => onRemove(game.id)}
        >
          <i className="fa-solid fa-trash" />
        </button>
      </div>
    </div>
  );
}
