import { useRef, useState } from "react";
import { t, useLocale } from "@/locales/i18n";
import type { Game } from "@/types/pywebview";
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
          title={t("common.edit")}
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
      </div>

      <div className="flex w-full flex-col gap-1 px-1">
        <span className="truncate text-center text-[12.5px] font-semibold leading-tight text-(--text)">{game.name}</span>
        <span className="text-center text-[10px] uppercase tracking-wide text-(--muted)">
          {game.expansion}
          {game.show_on_main ? t("common.onHome") : ""}
        </span>
      </div>

      <div className="flex w-full items-center gap-2">
        <button
          className="ghost-btn flex-1 rounded-lg py-1.5 text-[11px] cursor-pointer"
          onClick={() => onEdit(game)}
        >
          {t("common.edit")}
        </button>
        <button
          className="ghost-btn rounded-lg px-3 py-1.5 text-[11px] text-(--danger) cursor-pointer"
          onClick={() => onRemove(game.id)}
        >
          <i className="fa-solid fa-trash" />
        </button>
      </div>
    </div>
  );
}
