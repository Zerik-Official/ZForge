import { useEffect, useState } from "react";
import type { BootStep } from "@/hooks/useBoot";

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
 * Startup splash screen displayed before the main application layout mounts.
 * 
 * Lifecycle:
 * 1. Renders immediately with the logo animating in and a loading spinner.
 * 2. Progress and status messages update as the backend reports boot steps.
 * 3. When `bootDone` is true, the bar hits 100% and triggers a smooth fade-out.
 *
 * @example
 * ```tsx
 * <SplashScreen step={bootStep} bootDone={bootDone} onDone={() => setShowSplash(false)} />
 * ```
 */
export function SplashScreen({
  step,
  bootDone,
  onDone,
}: SplashScreenProps) {
  /** Controls the CSS opacity fade-out state. */
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    if (!bootDone) return;
    const delay = setTimeout(() => setHiding(true), 600);
    return () => clearTimeout(delay);
  }, [bootDone]);

  const handleTransitionEnd = () => {
    if (hiding) onDone();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-(--bg) transition-opacity duration-500 ${
        hiding ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      onTransitionEnd={handleTransitionEnd}
    >
      {/* ── Center content ──────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-6">
        {/* Logo */}
        <img
          className="w-20 h-20 animate-fade-in select-none"
          src="/assets/app/logo.svg"
          alt="ZForge"
          draggable={false}
        />

        {/* Spinner — hidden once the backend reports its first step */}
        <div
          className={`w-6 h-6 border-2 border-(--border-strong) border-t-(--primary) rounded-full animate-spin transition-opacity duration-300 ${
            step.percent > 0 ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        />

        {/* Messages */}
        <div className="h-6 flex items-center justify-center">
          {/* Keyed by message so every new message remounts and replays the entry animation. */}
          <p
            key={step.message}
            className="text-[13px] text-(--text-soft) animate-[fadeIn_0.2s_ease_both]"
          >
            {step.message}
          </p>
        </div>
      </div>

      {/* ── Bottom: progress bar ────────────────────────────────── */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 w-65">
        <div className="w-full h-1.5 bg-(--bg-input) rounded-full overflow-hidden border border-(--border-strong)">
          <div
            className="h-full bg-(--primary) transition-all duration-300 ease-out rounded-full"
            style={{ width: `${step.percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}