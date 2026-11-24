/**
 * useTrayStrings — sends the texts of the notification area menu to the backend in the
 * current language, on startup and whenever the language changes.
 */

import { useEffect } from "react";
import { t, useLocale } from "@/locales/i18n";
import { trayApi } from "@/services/api";

export function useTrayStrings(): void {
  const locale = useLocale();

  useEffect(() => {
    trayApi
      .setTrayStrings({ open: t("tray.open"), quit: t("tray.quit") })
      .catch((error: unknown) => console.error("Could not send the tray texts", error));
  }, [locale]);
}
