import { useEffect, useState, type TransitionEvent } from "react";
import type { BootStep } from "@/hooks/useBoot";
import { t } from "@/locales/i18n";
import type { ResourcesProgress } from "@/types/domains/boot";
import { formatBytes, formatSpeed } from "@/utils/formatters";
import { BuildCorners } from "./BuildStamp";
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
  /** Download of the missing resources, while it runs. */
  download?: ResourcesProgress | null;
}

/** Download speed at which the sparks of the rune flare at their fastest. */
const FULL_SPEED_BYTES = 8 * 1024 * 1024;

/**
 * Thin forge bar under the rune while resources download: how much is done, with a glint
 * that runs faster the faster the download goes, and the size and speed below.
 */
function DownloadMeter({ download }: { download: ResourcesProgress }) {
  const fraction = download.total > 0 ? Math.min(1, download.downloaded / download.total) : download.filesDone / Math.max(1, download.filesTotal);
  const pace = Math.max(0.6, 2.4 - (download.bytesPerSecond / FULL_SPEED_BYTES) * 1.8);
  return (
    <div className="flex w-64 flex-col items-center gap-2 animate-[fadeIn_0.3s_ease_both]">
      <div className="relative h-0.75 w-full overflow-hidden rounded-full bg-(--border-strong)">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-(--primary) transition-[width] duration-300 ease-out"
          style={{ width: `${(fraction * 100).toFixed(1)}%` }}
        />
        <div
          className="download-glint absolute inset-y-0 w-10"
          style={{ animationDuration: `${pace.toFixed(2)}s` }}
        />
      </div>
      <p className="text-[11.5px] text-(--muted) tabular-nums">
        {t("boot.speed", {
          size: formatBytes(download.downloaded),
          total: formatBytes(download.total),
          speed: formatSpeed(download.bytesPerSecond),
        })}
      </p>
    </div>
  );
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
export function SplashScreen({ step, bootDone, onDone, download = null }: SplashScreenProps) {
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
      <RuneLoader
        percent={bootDone ? 100 : step.percent}
        complete={bootDone}
        activity={download ? Math.min(1, download.bytesPerSecond / FULL_SPEED_BYTES) : 0}
      />

      <div className="flex min-h-10 flex-col items-center gap-1.5">
        <p key={step.message} className="animate-[fadeIn_0.2s_ease_both] text-[13.5px] text-(--text-soft)">
          {step.message}
        </p>
        <p className="text-[12px] text-(--muted) tabular-nums">{Math.round(bootDone ? 100 : step.percent)} %</p>
      </div>
      {download ? <DownloadMeter download={download} /> : null}
      <BuildCorners />
    </div>
  );
}
