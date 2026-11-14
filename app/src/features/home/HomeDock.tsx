import { useState } from "react";
import { toDisplaySrc } from "@/utils/asset";
import type { Game } from "@/types/domains/game";

interface HomeDockProps {
  dock: Game[];
  activeId: string;
  onSelect: (id: string) => void;
  onReorder: (orderedIds: string[]) => Promise<void>;
}

export function HomeDock({ dock, activeId, onSelect, onReorder }: HomeDockProps) {
  const canReorder = dock.length > 1;
  const [draggedId, setDraggedId] = useState<string | null>(null);

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
    void onReorder(next.map((g) => g.id));
    setDraggedId(null);
  }

  if (dock.length === 0) return null;

  return (
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
            game.id === activeId ? "border-(--accent)" : "border-(--border-strong)"
          }`}
          onClick={() => onSelect(game.id)}
        >
          <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-(--border-strong) bg-(--bg-elevated) px-2.5 py-1 text-[11px] font-medium text-(--text-soft) opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
            {game.name}
          </span>
          <img src={toDisplaySrc(game.icon)} alt={game.name} className="h-8 w-8 object-contain" />
          {game.id === activeId && (
            <span className="absolute -bottom-2.25 h-1 w-1 rounded-full bg-(--accent) shadow-[0_0_6px_var(--accent-glow)]" />
          )}
        </button>
      ))}
    </div>
  );
}
