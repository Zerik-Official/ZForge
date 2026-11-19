import { useRef, useState, useCallback } from "react";
import { useThemeControls } from "@/store/themeStore";
import { frameStyle, imageStyle } from "@/utils/theme";

/** Size of a skinned slider thumb when the theme does not set one. */
const SKIN_THUMB = 16;

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  options?: number[];
  disabled?: boolean;
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, options, disabled = false }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const skin = useThemeControls()?.slider ?? null;

  const isDiscrete = Array.isArray(options) && options.length > 0;
  const opts = isDiscrete ? options! : [];
  const currentIndex = isDiscrete ? Math.max(0, opts.indexOf(value)) : 0;
  const discreteMax = isDiscrete ? opts.length - 1 : 0;

  const getRatio = useCallback(() => {
    if (isDiscrete) {
      return discreteMax === 0 ? 0 : currentIndex / discreteMax;
    }
    const range = max - min;
    if (range === 0) return 0;
    return Math.max(0, Math.min(1, (value - min) / range));
  }, [isDiscrete, currentIndex, discreteMax, value, min, max]);

  const ratio = getRatio();

  function valueFromRatio(r: number): number {
    const clamped = Math.max(0, Math.min(1, r));
    if (isDiscrete) {
      const idx = Math.round(clamped * discreteMax);
      return opts[idx];
    }
    const raw = min + clamped * (max - min);
    const stepped = Math.round(raw / step) * step;
    return Math.max(min, Math.min(max, stepped));
  }

  function handlePointer(clientX: number) {
    if (!trackRef.current || disabled) return;
    const rect = trackRef.current.getBoundingClientRect();
    const r = (clientX - rect.left) / rect.width;
    const next = valueFromRatio(r);
    if (next !== value) onChange(next);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDragging(true);
    handlePointer(event.clientX);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || disabled) return;
    handlePointer(event.clientX);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    setDragging(false);
  }

  return (
    <div
      ref={trackRef}
      className={`relative flex h-6 w-full items-center select-none ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {skin ? (
        <>
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2" style={frameStyle(skin.track)} />
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-75"
            style={{ ...imageStyle(skin.thumb, SKIN_THUMB, SKIN_THUMB), left: `${ratio * 100}%` }}
          />
        </>
      ) : (
        <>
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-(--bg-input) border border-(--border-strong) overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-(--primary) rounded-full" style={{ width: `${ratio * 100}%` }} />
          </div>
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-(--primary) shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-[left] duration-75"
            style={{ left: `${ratio * 100}%` }}
          />
        </>
      )}
    </div>
  );
}
