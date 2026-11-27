import { useEffect, useMemo, useState, type TransitionEvent } from "react";
import { DEFAULT_SCENE_ASSETS } from "@/components/boot/assets";
import { MonolithLoader } from "@/components/boot/MonolithLoader";
import type { BootQuality, SceneAssets } from "@/components/boot/MonolithScene";
import { api } from "@/services/api";
import { useThemeStore } from "@/store/themeStore";
import type { BootQualitySetting } from "@/types/domains/settings";
import { toDisplaySrc } from "@/utils/asset";
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

/** Quality used with a custom theme, whose look the boot quality setting does not tune. */
const THEMED_QUALITY: BootQuality = "medium";

/**
 * Startup screen shown before the launcher layout appears.
 *
 * A floating rune monolith lights up as the backend reports boot steps, with the status,
 * a thin progress bar and the download below. When the boot is done the runes flare and
 * the screen fades out. The rune ring is drawn instead when the quality is `off` or the
 * 3D scene cannot run.
 *
 * @example
 * ```tsx
 * <SplashScreen step={bootStep} bootDone={bootDone} onDone={() => setShowSplash(false)} />
 * ```
 */
export function SplashScreen({ step, bootDone, onDone, download = null }: SplashScreenProps) {
  const [hiding, setHiding] = useState(false);
  const [setting, setSetting] = useState<BootQualitySetting | null>(null);
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    let cancelled = false;
    api
      .getAppConfig()
      .then((config) => {
        if (!cancelled) setSetting(config.boot_quality ?? "medium");
      })
      .catch(() => {
        if (!cancelled) setSetting("medium");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const assets = useMemo<SceneAssets>(() => {
    const boot = theme?.boot;
    return {
      model: boot?.model ? toDisplaySrc(boot.model) : DEFAULT_SCENE_ASSETS.model,
      albedo: boot?.albedo ? toDisplaySrc(boot.albedo) : DEFAULT_SCENE_ASSETS.albedo,
      mask: boot?.mask ? toDisplaySrc(boot.mask) : DEFAULT_SCENE_ASSETS.mask,
    };
  }, [theme]);
  const quality: BootQuality | "off" | null = theme ? THEMED_QUALITY : setting;
  const percent = bootDone ? 100 : step.percent;
  const activity = download ? Math.min(1, download.bytesPerSecond / FULL_SPEED_BYTES) : 0;

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
      {quality === "off" ? (
        <RuneLoader percent={percent} complete={bootDone} activity={activity} />
      ) : quality ? (
        <MonolithLoader percent={percent} complete={bootDone} activity={activity} quality={quality} assets={assets} />
      ) : null}

      <div className={`flex w-80 flex-col items-center gap-2.5 ${quality === "off" ? "" : "absolute bottom-16"}`}>
        <p key={step.message} className="animate-[fadeIn_0.2s_ease_both] text-[13.5px] text-(--text-soft) [text-shadow:0_1px_8px_var(--bg)]">
          {step.message}
        </p>
        <div className="relative h-0.75 w-full overflow-hidden rounded-full bg-(--border-strong)" aria-hidden="true">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-(--primary) shadow-[0_0_10px_var(--primary)] transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-[12px] text-(--muted) tabular-nums">{Math.round(percent)} %</p>
        {download ? <DownloadMeter download={download} /> : null}
      </div>
      <BuildCorners />
    </div>
  );
}
