/**
 * useSdkInstall — install, update or repair the SDK with download progress.
 *
 * Every call installs the latest published release. When it finishes the
 * backend emits `capabilities://changed`, so every requirement refreshes.
 */

import { useEffect, useState } from "react";
import { t } from "@/locales/i18n";
import { errorCode, sdkApi } from "@/services/api";
import { onSdkDownloadProgress, subscribe } from "@/services/api/events";
import type { SdkDownloadProgress } from "@/types/domains/sdk";

export interface SdkInstallState {
  installing: boolean;
  progress: SdkDownloadProgress | null;
  error: string | null;
  install: () => Promise<boolean>;
}

export function useSdkInstall(): SdkInstallState {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<SdkDownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribe(
        onSdkDownloadProgress((payload) => {
          setProgress(payload);
        }),
      ),
    [],
  );

  async function install(): Promise<boolean> {
    setInstalling(true);
    setProgress(null);
    setError(null);
    try {
      await sdkApi.installSdk();
      return true;
    } catch (e) {
      setError(t(`common.errors.codes.${errorCode(e)}`));
      return false;
    } finally {
      setInstalling(false);
      setProgress(null);
    }
  }

  return { installing, progress, error, install };
}
