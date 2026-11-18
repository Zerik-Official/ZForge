/**
 * useCapabilities — which launcher features the installed SDK supports.
 *
 * Loads them once and reloads them whenever the backend reports that the
 * installed SDK changed (`capabilities://changed`).
 */

import { useEffect, useState } from "react";
import { sdkApi } from "@/services/api";
import { onCapabilitiesChanged, subscribe } from "@/services/api/events";
import type { Capabilities, Feature, FeatureStatus } from "@/types/domains/capabilities";

export function useCapabilities(): Capabilities | null {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      sdkApi
        .getCapabilities()
        .then((next) => {
          if (!cancelled) setCapabilities(next);
        })
        .catch((error: unknown) => console.error("Could not read the SDK capabilities", error));
    void load();
    const unsubscribe = subscribe(onCapabilitiesChanged(() => void load()));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return capabilities;
}

/** Status of one feature, or `null` while the capabilities are loading. */
export function featureStatus(capabilities: Capabilities | null, feature: Feature): FeatureStatus | null {
  return capabilities?.features.find((status) => status.feature === feature) ?? null;
}
