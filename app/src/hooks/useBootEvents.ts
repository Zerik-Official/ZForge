/**
 * useBootEvents — listens for backend boot progress events.
 *
 * The backend emits events via evaluate_js (wrapped in the EventEmitter
 * abstraction). The frontend registers global handlers that pywebview
 * can call directly.
 *
 * Expected backend events:
 *   window.__zforge_boot_message(message: string, percent: number)
 *   window.__zforge_boot_done()
 *
 * These handlers are registered once on mount and cleaned up on unmount.
 */

import { useState, useEffect, useCallback } from "react";

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

const INITIAL_STEP: BootStep = { message: "Connecting to backend…", percent: 0 };

export function useBootEvents(): UseBootEventsResult {
  const [step, setStep] = useState<BootStep>(INITIAL_STEP);
  const [done, setDone] = useState(false);

  const handleMessage = useCallback((message: string, percent: number) => {
    setStep({ message, percent: Math.min(100, Math.max(0, percent)) });
  }, []);

  const handleDone = useCallback(() => {
    setStep({ message: "Ready.", percent: 100 });
    setDone(true);
  }, []);

  useEffect(() => {
    // Register global handlers so the backend can call them via evaluate_js.
    window.__zforge_boot_message = handleMessage;
    window.__zforge_boot_done = handleDone;

    return () => {
      delete window.__zforge_boot_message;
      delete window.__zforge_boot_done;
    };
  }, [handleMessage, handleDone]);

  return { step, done };
}