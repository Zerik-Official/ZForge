import { useCallback, useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { featureStatus, useCapabilities } from "@/hooks/useCapabilities";
import { useSdkInstall } from "@/hooks/useSdkInstall";
import { t, useLocale } from "@/locales/i18n";
import { api, errorCode } from "@/services/api";
import type { Feature } from "@/types/domains/capabilities";
import type { SdkStatus } from "@/types/domains/sdk";
import { formatBytes, formatEta, formatSpeed } from "@/utils/formatters";
import { SdkInfoModal } from "../components/SdkInfoModal";

const FEATURES: { feature: Feature; icon: string }[] = [
  { feature: "live_session", icon: "fa-gamepad" },
  { feature: "notifications", icon: "fa-bell" },
  { feature: "whisper_reply", icon: "fa-reply" },
  { feature: "accounts", icon: "fa-user-shield" },
  { feature: "hidden_start", icon: "fa-eye-slash" },
];

function cleanVersion(version: string | null | undefined): string {
  return version ? version.replace(/^v/i, "") : "";
}

/**
 * WoWControlSDK tab: installed and latest version, the single place to
 * install, update or repair it, and what each feature needs.
 */
export function SdkTab() {
  useLocale();
  const capabilities = useCapabilities();
  const { installing, progress, error: installError, install } = useSdkInstall();
  const [status, setStatus] = useState<SdkStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.getSdkStatus());
      setError(null);
    } catch (e) {
      setError(t(`common.errors.codes.${errorCode(e)}`));
    }
  }, []);

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

  async function handleInstall() {
    await install();
    await refreshStatus();
  }

  async function handleToggleAutoUpdate(value: boolean) {
    await api.saveAppConfig({ discord_auto_update: value });
    setStatus((prev) => (prev ? { ...prev, discord_auto_update: value } : prev));
  }

  if (!status) {
    return (
      <div className="flex flex-1 items-center justify-center text-(--muted)">
        {error ? <span className="text-[12px] text-(--danger)">{error}</span> : <i className="fa-solid fa-spinner fa-spin text-[18px]" />}
      </div>
    );
  }

  const lastError = status.sdk_last_error && status.sdk_ever_installed ? status.sdk_last_error : null;
  const action = status.needs_repair
    ? { label: t("capabilities.actions.repair"), icon: "fa-screwdriver-wrench" }
    : status.needs_install
      ? { label: t("capabilities.actions.install"), icon: "fa-download" }
      : status.update_available
        ? { label: t("capabilities.actions.update"), icon: "fa-arrow-up" }
        : null;
  const stateKey = status.needs_repair ? "corrupted" : status.needs_install ? "missing" : status.update_available ? "outdated" : "upToDate";

  return (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[13px] font-semibold text-(--text)">{t("launcher.settings.sdk.title")}</h2>
          <p className="max-w-xl text-[11px] leading-relaxed text-(--muted)">{t("launcher.settings.sdk.description")}</p>
        </div>
        <button
          className="flex shrink-0 items-center gap-2 rounded-lg border border-(--border-strong) bg-(--bg-elevated) px-3 py-2 text-[12.5px] font-medium text-(--text-soft) hover:bg-(--bg-hover) hover:text-(--text) cursor-pointer"
          onClick={() => setShowInfo(true)}
        >
          <i className="fa-solid fa-circle-info text-[12px]" />
          {t("launcher.settings.richPresence.moreInfo")}
        </button>
      </div>

      {lastError ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <i className="fa-solid fa-triangle-exclamation text-[13px] text-amber-500" />
          <span className="text-[12px] font-semibold text-amber-500">
            {lastError === "sdk_corrupted" ? t("launcher.settings.sdk.corruptionError") : t(`common.errors.codes.${lastError}`)}
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 rounded-xl border border-(--border-strong) bg-(--bg-card) p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--border-strong) bg-(--bg-elevated)">
            <i className="fa-solid fa-cube text-[14px] text-(--muted)" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="text-[13px] font-semibold text-(--text)">{t(`launcher.settings.sdk.state.${stateKey}.title`)}</h3>
            <p className="max-w-xl text-[12px] leading-relaxed text-(--muted)">{t(`launcher.settings.sdk.state.${stateKey}.description`)}</p>
            <span className="text-[11px] text-(--muted-2)">
              {status.version ? t("launcher.settings.sdk.version.installed", { version: cleanVersion(status.version) }) : t("launcher.settings.sdk.version.none")}
              {status.latest_version ? ` · ${t("launcher.settings.sdk.version.latest", { version: cleanVersion(status.latest_version) })}` : ""}
            </span>
            {status.missing_files.length > 0 ? (
              <span className="text-[11px] text-(--danger)">{t("launcher.settings.sdk.missingFiles", { files: status.missing_files.join(", ") })}</span>
            ) : null}
          </div>
        </div>

        {installing ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] text-(--muted)">
              <span>{t("capabilities.installing")}</span>
              <span>{progress ? `${progress.percent}%` : ""}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full border border-(--border-strong) bg-(--bg-input)">
              <div className="h-full bg-(--primary) transition-all duration-200" style={{ width: `${progress?.percent ?? 0}%` }} />
            </div>
            {progress ? (
              <div className="flex items-center justify-between text-[11px] text-(--muted-2)">
                <span>{t("launcher.settings.sdk.progress.downloaded", { downloaded: formatBytes(progress.downloaded), total: progress.total ? formatBytes(progress.total) : "—" })}</span>
                <span>
                  {t("launcher.settings.sdk.progress.speed", { speed: formatSpeed(progress.speed) })}
                  {" · "}
                  {t("launcher.settings.sdk.progress.remaining", { time: formatEta(progress.eta) })}
                </span>
              </div>
            ) : null}
          </div>
        ) : action ? (
          <button
            className="flex w-fit items-center gap-2 rounded-lg bg-[linear-gradient(160deg,var(--primary-hover),var(--primary-active))] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_0_20px_var(--primary-glow)] hover:brightness-105 cursor-pointer"
            onClick={() => void handleInstall()}
          >
            <i className={`fa-solid ${action.icon} text-[12px]`} />
            {action.label}
          </button>
        ) : null}
        {installError ? <span className="text-[12px] text-(--danger)">{installError}</span> : null}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-(--border-strong) bg-(--bg-card) p-5">
        <Checkbox
          checked={status.discord_auto_update}
          onChange={(value) => void handleToggleAutoUpdate(value)}
          label={t("launcher.settings.sdk.autoUpdate")}
          description={t("launcher.settings.sdk.autoUpdateDescription")}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-(--border-strong) bg-(--bg-card) p-5">
        <h3 className="text-[12px] font-semibold text-(--text-soft)">{t("launcher.settings.sdk.featuresTitle")}</h3>
        {FEATURES.map(({ feature, icon }) => {
          const current = featureStatus(capabilities, feature);
          return (
            <div key={feature} className="flex items-start gap-3">
              <i className={`fa-solid ${icon} mt-1 w-4 text-center text-[12px] text-(--muted)`} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[12.5px] font-medium text-(--text)">{t(`capabilities.features.${feature}.label`)}</span>
                <span className="text-[11px] leading-relaxed text-(--muted)">{t(`capabilities.features.${feature}.description`)}</span>
              </div>
              {current ? (
                current.available ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-(--success)/10 px-2 py-0.5 text-[10px] font-semibold text-(--success)">
                    <i className="fa-solid fa-check text-[9px]" />
                    {t("capabilities.available")}
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                    {t("capabilities.requires", { version: current.required_version })}
                  </span>
                )
              ) : null}
            </div>
          );
        })}
      </div>

      <SdkInfoModal open={showInfo} onClose={() => setShowInfo(false)} />
    </div>
  );
}
