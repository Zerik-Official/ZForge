import { useEffect, useState } from "react";
import { Notice } from "@/components/layout/Notice";
import { PageState } from "@/components/layout/PageState";
import { SettingsGroup, SettingsPage } from "@/components/layout/SettingsPage";
import { SdkRequirement } from "@/components/sdk/SdkRequirement";
import { Checkbox } from "@/components/ui/Checkbox";
import { featureStatus, useCapabilities } from "@/hooks/useCapabilities";
import { t, useLocale } from "@/locales/i18n";
import { api, errorCode } from "@/services/api";
import type { SdkStatus } from "@/types/domains/sdk";

/**
 * Rich Presence settings tab. The SDK itself is managed in the SDK tab; this
 * tab only shows what Rich Presence needs from it.
 */
export function RichPresenceTab() {
  useLocale();
  const capabilities = useCapabilities();
  const [status, setStatus] = useState<SdkStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSdkStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(t(`common.errors.codes.${errorCode(e)}`));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggleDiscord(value: boolean) {
    try {
      await api.saveAppConfig({ discord_enabled: value });
      setStatus((prev) => (prev ? { ...prev, discord_enabled: value } : prev));
      setError(null);
    } catch (e) {
      setError(t(`common.errors.codes.${errorCode(e)}`));
    }
  }

  if (!status) {
    return <PageState error={error} />;
  }

  return (
    <SettingsPage title={t("launcher.settings.richPresence.title")} description={t("launcher.settings.richPresence.description")}>
      {status.application_id_configured ? null : (
        <Notice
          tone="warning"
          icon="fa-solid fa-circle-info"
          title={t("launcher.settings.richPresence.applicationIdMissing.title")}
          description={t("launcher.settings.richPresence.applicationIdMissing.description")}
        />
      )}

      <SdkRequirement status={featureStatus(capabilities, "live_session")} />

      <SettingsGroup>
        <Checkbox
          layout="row"
          checked={status.discord_enabled}
          onChange={(value) => void handleToggleDiscord(value)}
          label={t("launcher.settings.richPresence.settings.enableDiscord")}
          description={t("launcher.settings.richPresence.settings.enableDiscordDescription")}
          disabled={!status.application_id_configured}
        />
      </SettingsGroup>

      {error ? <span className="text-[12.5px] text-(--danger)">{error}</span> : null}
    </SettingsPage>
  );
}
