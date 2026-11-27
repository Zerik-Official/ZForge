import { useEffect, useState } from "react";
import { systemApi } from "@/services/api";
import type { BuildInfo } from "@/types/domains/system";

let cached: Promise<BuildInfo> | null = null;

/** Version and commit of the running launcher, read once per run. */
export function useBuildInfo(): BuildInfo | null {
  const [info, setInfo] = useState<BuildInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    cached ??= systemApi.getBuildInfo();
    cached
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch((error: unknown) => {
        cached = null;
        console.error("Could not read the build information", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
