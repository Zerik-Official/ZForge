/**
 * useBoot — runs the backend startup sequence and tracks its progress.
 *
 * Progress arrives as `boot://progress` events carrying translation keys;
 * the `run_boot` command resolves with the settings conflicts found.
 */

import { useEffect, useState } from "react";
import { t } from "@/locales/i18n";
import { bootApi } from "@/services/api";
import { onBootProgress, subscribe } from "@/services/api/events";
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

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribe(
      onBootProgress((progress) => {
        if (!cancelled) {
          setStep({ message: t(progress.key, progress.params), percent: clampPercent(progress.percent) });
        }
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
      unsubscribe();
    };
  }, [onConflicts]);

  return { step, done };
}
