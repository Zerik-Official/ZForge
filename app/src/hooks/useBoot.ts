/**
 * useBoot — runs the backend startup sequence and tracks its progress.
 *
 * Progress arrives as `boot://progress` events carrying translation keys;
 * the `run_boot` command resolves with the settings conflicts found.
 */

import { useEffect, useState } from "react";
import { t } from "@/locales/i18n";
import { bootApi } from "@/services/api";
import { onBootProgress, onResourcesProgress, subscribe } from "@/services/api/events";
import type { ResourcesProgress } from "@/types/domains/boot";
import type { ConfigConflict } from "@/types/domains/settings";

export interface BootStep {
  message: string;
  percent: number;
}

interface UseBootResult {
  /** Latest step reported by the backend. */
  step: BootStep;
  /** True once the startup sequence finished (successfully or not). */
  done: boolean;
  /** Download of the missing resources, while it runs. */
  download: ResourcesProgress | null;
}

function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, percent));
}

/**
 * @param onConflicts Receives the settings conflicts found during startup; must be stable.
 */
export function useBoot(onConflicts: (conflicts: ConfigConflict[]) => void): UseBootResult {
  const [step, setStep] = useState<BootStep>(() => ({ message: t("boot.connecting"), percent: 0 }));
  const [done, setDone] = useState(false);
  const [download, setDownload] = useState<ResourcesProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubscribeSteps = subscribe(
      onBootProgress((progress) => {
        if (!cancelled) {
          setStep({ message: t(progress.key, progress.params), percent: clampPercent(progress.percent) });
        }
      }),
    );
    const unsubscribeDownload = subscribe(
      onResourcesProgress((progress) => {
        if (!cancelled) setDownload(progress.filesDone >= progress.filesTotal ? null : progress);
      }),
    );

    bootApi
      .runBoot()
      .then((report) => {
        if (cancelled) return;
        setStep({ message: t("boot.ready"), percent: 100 });
        onConflicts(report.conflicts);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Boot sequence failed", error);
        setStep({ message: t("boot.failed"), percent: 100 });
      })
      .finally(() => {
        if (!cancelled) setDone(true);
      });

    return () => {
      cancelled = true;
      unsubscribeSteps();
      unsubscribeDownload();
    };
  }, [onConflicts]);

  return { step, done, download: done ? null : download };
}
