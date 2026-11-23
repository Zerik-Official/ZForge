import { useState } from "react";
import { TooltipSimple } from "@/components/ui/Tooltip";
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

  if (dock.length < 2) return null;

  return (
    <div className="ml-auto flex items-center gap-2" role="list">
      {dock.map((game) => {
        const active = game.id === activeId;
        return (
          <TooltipSimple key={game.id} content={game.name} side="top" align="center">
            <button
              role="listitem"
              draggable={canReorder}
              onDragStart={(event) => handleDragStart(event, game.id)}
              onDragOver={handleDragOver}
              onDrop={(event) => handleDrop(event, game.id)}
              onDragEnd={() => setDraggedId(null)}
              aria-label={game.name}
              aria-current={active ? "true" : undefined}
              className={`flex h-11 w-11 items-center justify-center rounded-[9px] border bg-(--bg-card)/90 backdrop-blur-md transition-colors hover:bg-(--bg-elevated) ${
                canReorder ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
              } ${draggedId === game.id ? "opacity-40" : ""} ${active ? "border-(--primary)" : "border-(--border-strong)"}`}
              onClick={() => onSelect(game.id)}
            >
              <img src={toDisplaySrc(game.icon)} alt="" className="h-6.5 w-6.5 object-contain" draggable={false} />
            </button>
          </TooltipSimple>
        );
      })}
    </div>
  );
}
