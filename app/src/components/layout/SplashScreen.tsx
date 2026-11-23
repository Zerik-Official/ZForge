import { useEffect, useState, type TransitionEvent } from "react";
import type { BootStep } from "@/hooks/useBoot";
import { RuneLoader } from "./RuneLoader";

/** Time the finished rune stays on screen so the central sigil can be drawn. */
const HOLD_AFTER_DONE_MS = 1300;
/** Length of the fade-out; `onDone` also fires after it when no transition event arrives. */
const FADE_MS = 500;

/**
 * Properties for the {@link SplashScreen} component.
 */
interface SplashScreenProps {
  /** Latest boot lifecycle step containing the status message and completion percentage. */
  step: BootStep;
  /** Flag indicating whether the backend has signaled completion of the boot sequence. */
  bootDone: boolean;
  /** Callback fired once the component's fade-out transition finishes. */
  onDone: () => void;
}

/**
 * Startup screen shown before the launcher layout appears.
 *
 * The rune ring fills as the backend reports boot steps. When the boot is done the
 * central sigil is drawn, and the screen fades out.
 *
 * @example
 * ```tsx
 * <SplashScreen step={bootStep} bootDone={bootDone} onDone={() => setShowSplash(false)} />
 * ```
 */
export function SplashScreen({ step, bootDone, onDone }: SplashScreenProps) {
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    if (!bootDone) return;
    const delay = setTimeout(() => setHiding(true), HOLD_AFTER_DONE_MS);
    return () => clearTimeout(delay);
  }, [bootDone]);

  useEffect(() => {
    if (!hiding) return;
    const fallback = setTimeout(onDone, FADE_MS + 200);
    return () => clearTimeout(fallback);
  }, [hiding, onDone]);

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (hiding && event.target === event.currentTarget) onDone();
  };

  return (
    <div
      data-tauri-drag-region
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-(--bg) transition-opacity duration-500 ${
        hiding ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      onTransitionEnd={handleTransitionEnd}
      role="status"
      aria-live="polite"
    >
      <RuneLoader percent={bootDone ? 100 : step.percent} complete={bootDone} />

      <div className="flex min-h-10 flex-col items-center gap-1.5">
        <p key={step.message} className="animate-[fadeIn_0.2s_ease_both] text-[13.5px] text-(--text-soft)">
          {step.message}
        </p>
        <p className="text-[12px] text-(--muted) tabular-nums">{Math.round(bootDone ? 100 : step.percent)} %</p>
      </div>
    </div>
  );
}
