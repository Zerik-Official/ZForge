import { useRef, useState } from "react";
import { t, useLocale } from "@/locales/i18n";
import { TooltipSimple } from "@/components/ui/Tooltip";
import type { Game } from "@/types/domains/game";
import { toDisplaySrc } from "@/utils/asset";

interface GameCardProps {
  game: Game;
  onEdit: (game: Game) => void;
  onRemove: (id: string) => void;
}

export function GameCard({ game, onEdit, onRemove }: GameCardProps) {
  useLocale();
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50 });
  const [hover, setHover] = useState(false);

  function handleMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const rotY = (dx / (rect.width / 2)) * 6;
    const rotX = -(dy / (rect.height / 2)) * 6;
    setTilt({ x: Math.max(-6, Math.min(6, rotY)), y: Math.max(-6, Math.min(6, rotX)) });
    setGlare({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
  }

  function handleLeave() {
    setHover(false);
    setTilt({ x: 0, y: 0 });
    setGlare({ x: 50, y: 50 });
  }

  return (
    <div
      className="group flex w-42 flex-col items-center gap-3"
      onMouseMove={handleMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={handleLeave}
      style={{ perspective: "900px" }}
    >
      <div
        ref={cardRef}
        className="relative h-53.75 w-37 shrink-0 overflow-hidden rounded-[10px] border border-(--border-strong) bg-black shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
        style={{
          transform: `rotateX(${tilt.y}deg) rotateY(${tilt.x}deg) scale3d(${hover ? 1.02 : 1}, ${hover ? 1.02 : 1}, 1)`,
          transition: hover ? "transform 100ms ease-out" : "transform 600ms ease-out",
          transformStyle: "preserve-3d",
        }}
      >
        <button
          className="absolute inset-0 cursor-pointer"
          onClick={() => onEdit(game)}
        >
          <img
            src={toDisplaySrc(game.box || game.poster || game.icon)}
            alt={game.name}
            className="h-full w-full object-cover"
            draggable={false}
          />
        </button>

        <div
          className="pointer-events-none absolute inset-0 rounded-[10px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{
            background: `radial-gradient(320px circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.22), transparent 42%)`,
          }}
        />

        <div className="pointer-events-none absolute inset-0 rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(0,0,0,0.35)]" />

        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 rounded-t-[10px] bg-linear-to-b from-black/70 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

        <div className="absolute inset-x-2 top-2 flex -translate-y-1.5 items-center justify-between opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <TooltipSimple content={t("common.edit")} side="bottom" align="center" sideOffset={6}>
            <button
              className="card-icon-btn"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(game);
              }}
            >
              <i className="fa-solid fa-pen text-[11px]" />
            </button>
          </TooltipSimple>
          <TooltipSimple content={t("common.delete")} side="bottom" align="center" sideOffset={6}>
            <button
              className="card-icon-btn card-icon-btn--danger"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(game.id);
              }}
            >
              <i className="fa-solid fa-trash text-[11px]" />
            </button>
          </TooltipSimple>
        </div>
      </div>

      <div className="flex w-full flex-col gap-1 px-1">
        <span className="truncate text-center text-[12.5px] font-semibold leading-tight text-(--text)">{game.name}</span>
        <span className="text-center text-[10px] uppercase tracking-wide text-(--muted)">
          {game.expansion}
          {game.show_on_main ? t("common.onHome") : ""}
        </span>
      </div>
    </div>
  );
}