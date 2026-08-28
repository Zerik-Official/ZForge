/**
 * useBridge — tracks pywebview bridge readiness.
 *
 * Returns:
 *   ready  — true once the bridge API is fully callable.
 *   error  — set if the bridge timed out.
 */

import { useState, useEffect } from "react";
import { waitForBridge } from "@/services/api";

interface UseBridgeResult {
  ready: boolean;
  error: string | null;
}

export function useBridge(): UseBridgeResult {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    waitForBridge()
      .then(() => { if (!cancelled) setReady(true); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });

    return () => { cancelled = true; };
  }, []);

  return { ready, error };
}