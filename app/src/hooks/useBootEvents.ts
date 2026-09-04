/**
 * useBootEvents — listens for backend boot progress events.
 */

import { useState, useEffect, useCallback } from "react";
import { t } from "@/locales/i18n";

export interface BootStep {
  message: string;
  percent: number;
}

interface UseBootEventsResult {
  /** Latest step received from the backend. */
  step: BootStep;
  /** True once the backend emits the boot_done event. */
  done: boolean;
}

export interface BootMessagePayload {
  key: string;
  percent: number;
  params?: Record<string, string | number>;
}

const INITIAL_STEP: BootStep = { message: "Connecting to backend…", percent: 0 };

export function useBootEvents(): UseBootEventsResult {
  const [step, setStep] = useState<BootStep>(INITIAL_STEP);
  const [done, setDone] = useState(false);

  const handleMessage = useCallback(
    (payloadOrMessage: string | BootMessagePayload, percentOrParams?: number | Record<string, string | number>, maybePercent?: number) => {

      if (typeof payloadOrMessage === "object" && payloadOrMessage !== null && "key" in payloadOrMessage) {
        const payload = payloadOrMessage as BootMessagePayload;
        const translated = t(payload.key, payload.params as Record<string, string | number> | undefined);
        setStep({ message: translated, percent: Math.min(100, Math.max(0, payload.percent)) });
        return;
      }

      if (typeof payloadOrMessage === "string" && typeof percentOrParams === "number") {
        const key = payloadOrMessage;
        const params = typeof maybePercent === "object" ? (maybePercent as Record<string, string | number>) : undefined;
        const isKey = key.includes(".");
        const message = isKey ? t(key, params as Record<string, string | number> | undefined) : key;
        setStep({ message, percent: Math.min(100, Math.max(0, percentOrParams)) });
        return;
      }

      if (typeof payloadOrMessage === "string" && typeof percentOrParams === "object") {
        const key = payloadOrMessage;
        const params = percentOrParams as Record<string, string | number>;
        const percent = typeof maybePercent === "number" ? maybePercent : 0;
        const message = key.includes(".") ? t(key, params) : key;
        setStep({ message, percent: Math.min(100, Math.max(0, percent)) });
      }
    },
    [],
  );

  const handleDone = useCallback(() => {
    setStep({ message: "Ready.", percent: 100 });
    setDone(true);
  }, []);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__zforge_boot_message = handleMessage as unknown as Window["__zforge_boot_message"];
    window.__zforge_boot_done = handleDone;

    return () => {
      delete window.__zforge_boot_message;
      delete window.__zforge_boot_done;
    };
  }, [handleMessage, handleDone]);

  return { step, done };
}