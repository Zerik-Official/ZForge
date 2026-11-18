import { useEffect, useState } from "react";
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
    return (
      <div className="flex flex-1 items-center justify-center text-(--muted)">
        {error ? <span className="text-[12px] text-(--danger)">{error}</span> : <i className="fa-solid fa-spinner fa-spin text-[18px]" />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-[13px] font-semibold text-(--text)">{t("launcher.settings.richPresence.title")}</h2>
        <p className="max-w-xl text-[11px] leading-relaxed text-(--muted)">{t("launcher.settings.richPresence.description")}</p>
      </div>

      {status.application_id_configured ? null : (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <i className="fa-solid fa-circle-info mt-0.5 text-[13px] text-amber-500" />
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-amber-500">{t("launcher.settings.richPresence.applicationIdMissing.title")}</span>
            <span className="text-[11px] leading-relaxed text-(--muted)">{t("launcher.settings.richPresence.applicationIdMissing.description")}</span>
          </div>
        </div>
      )}

      <SdkRequirement status={featureStatus(capabilities, "live_session")} />

      <div className="flex flex-col gap-3 rounded-xl border border-(--border-strong) bg-(--bg-card) p-5">
        <Checkbox
          checked={status.discord_enabled}
          onChange={(value) => void handleToggleDiscord(value)}
          label={t("launcher.settings.richPresence.settings.enableDiscord")}
          description={t("launcher.settings.richPresence.settings.enableDiscordDescription")}
          disabled={!status.application_id_configured}
        />
      </div>

      {error ? <span className="text-[12px] text-(--danger)">{error}</span> : null}
    </div>
  );
}
