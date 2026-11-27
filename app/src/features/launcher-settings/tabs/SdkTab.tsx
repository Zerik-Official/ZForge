import { Notice } from "@/components/layout/Notice";
import { PageState } from "@/components/layout/PageState";
import { SettingsGroup, SettingsPage, SettingsRow } from "@/components/layout/SettingsPage";
import { useCallback, useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { featureStatus, useCapabilities } from "@/hooks/useCapabilities";
import { useSdkInstall } from "@/hooks/useSdkInstall";
import { t, useLocale } from "@/locales/i18n";
import { api, errorCode, sdkApi } from "@/services/api";
import type { Feature } from "@/types/domains/capabilities";
import type { SdkIntegrity, SdkStatus } from "@/types/domains/sdk";
import { formatBytes, formatEta, formatSpeed } from "@/utils/formatters";
import { SdkInfoModal } from "../components/SdkInfoModal";

const INTEGRITY_ICONS: Record<SdkIntegrity["state"], string> = {
  verified: "fa-shield-halved text-(--success)",
  trusted: "fa-shield-halved text-(--warning)",
  mismatch: "fa-triangle-exclamation text-(--danger)",
  unknown: "fa-circle-question",
};

const FEATURES: { feature: Feature; icon: string }[] = [
  { feature: "live_session", icon: "fa-gamepad" },
  { feature: "notifications", icon: "fa-bell" },
  { feature: "whisper_reply", icon: "fa-reply" },
  { feature: "accounts", icon: "fa-user-shield" },
  { feature: "hidden_start", icon: "fa-eye-slash" },
  { feature: "glue_screens", icon: "fa-earth-europe" },
  { feature: "player_portraits", icon: "fa-id-badge" },
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
    return <PageState error={error} />;
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
    <SettingsPage
      title={t("launcher.settings.sdk.title")}
      description={t("launcher.settings.sdk.description")}
      actions={
        <button
          className="ghost-btn flex items-center gap-2 rounded-[7px] px-3 py-2 text-[13px] font-medium cursor-pointer"
          onClick={() => setShowInfo(true)}
        >
          <i className="fa-solid fa-circle-info text-[12px]" />
          {t("launcher.settings.richPresence.moreInfo")}
        </button>
      }
    >
      {lastError ? (
        <Notice
          tone="warning"
          icon="fa-solid fa-triangle-exclamation"
          title={lastError === "sdk_corrupted" ? t("launcher.settings.sdk.corruptionError") : t(`common.errors.codes.${lastError}`)}
        />
      ) : null}

      <SettingsGroup>
        <div className="flex flex-col gap-4 px-4.5 py-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] bg-(--bg-elevated)">
              <i className={`fa-solid fa-cube text-[15px] ${stateKey === "upToDate" ? "text-(--success)" : "text-(--muted)"}`} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h3 className="text-[14px] font-semibold text-(--text)">{t(`launcher.settings.sdk.state.${stateKey}.title`)}</h3>
              <p className="max-w-[64ch] text-[12.5px] leading-relaxed text-(--muted)">{t(`launcher.settings.sdk.state.${stateKey}.description`)}</p>
              <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-(--muted-2)">
                <span>
                  {status.version ? t("launcher.settings.sdk.version.installed", { version: cleanVersion(status.version) }) : t("launcher.settings.sdk.version.none")}
                </span>
                {status.latest_version ? <span>{t("launcher.settings.sdk.version.latest", { version: cleanVersion(status.latest_version) })}</span> : null}
              </span>
              {status.missing_files.length > 0 ? (
                <span className="text-[12px] text-(--danger)">{t("launcher.settings.sdk.missingFiles", { files: status.missing_files.join(", ") })}</span>
              ) : null}
            </div>
            {action && !installing ? (
              <button
                className="play-btn flex shrink-0 items-center gap-2 rounded-[7px] px-4 py-2 text-[13px] font-semibold cursor-pointer"
                onClick={() => void handleInstall()}
              >
                <i className={`fa-solid ${action.icon} text-[12px]`} />
                {action.label}
              </button>
            ) : null}
          </div>

          {installing ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[12px] text-(--muted)">
                <span>{t("capabilities.installing")}</span>
                <span className="tabular-nums">{progress ? `${progress.percent}%` : ""}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--bg-input)">
                <div className="h-full bg-(--primary) transition-all duration-200" style={{ width: `${progress?.percent ?? 0}%` }} />
              </div>
              {progress ? (
                <div className="flex items-center justify-between gap-4 text-[12px] text-(--muted-2) tabular-nums">
                  <span>{t("launcher.settings.sdk.progress.downloaded", { downloaded: formatBytes(progress.downloaded), total: progress.total ? formatBytes(progress.total) : "—" })}</span>
                  <span className="flex gap-4">
                    <span>{t("launcher.settings.sdk.progress.speed", { speed: formatSpeed(progress.speed) })}</span>
                    <span>{t("launcher.settings.sdk.progress.remaining", { time: formatEta(progress.eta) })}</span>
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          {installError ? <span className="text-[12.5px] text-(--danger)">{installError}</span> : null}
        </div>
        {status.integrity ? (
          <SettingsRow
            icon={`fa-solid ${INTEGRITY_ICONS[status.integrity.state]}`}
            label={t(`launcher.settings.sdk.integrity.${status.integrity.state}.title`)}
            description={
              status.integrity.state === "mismatch" && status.integrity.unknown_version
                ? t("launcher.settings.sdk.integrity.unknownVersion")
                : status.integrity.state === "mismatch" || status.integrity.state === "trusted"
                  ? t(`launcher.settings.sdk.integrity.${status.integrity.state}.description`, {
                      files: status.integrity.files.join(", "),
                    })
                  : t(`launcher.settings.sdk.integrity.${status.integrity.state}.description`)
            }
            control={
              status.integrity.state === "mismatch" || status.integrity.state === "trusted" ? (
                <>
                  {status.integrity.state === "mismatch" ? (
                    <button
                      className="ghost-btn rounded-[7px] px-3 py-1.5 text-[12.5px] cursor-pointer"
                      onClick={() => void sdkApi.trustSdk().then(refreshStatus)}
                    >
                      {t("launcher.settings.sdk.integrity.trust")}
                    </button>
                  ) : null}
                  <button
                    className="play-btn rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40 cursor-pointer"
                    onClick={() => void handleInstall()}
                    disabled={installing}
                  >
                    {t("launcher.settings.sdk.integrity.reinstall")}
                  </button>
                </>
              ) : null
            }
          />
        ) : null}
        <Checkbox
          layout="row"
          checked={status.discord_auto_update}
          onChange={(value) => void handleToggleAutoUpdate(value)}
          label={t("launcher.settings.sdk.autoUpdate")}
          description={t("launcher.settings.sdk.autoUpdateDescription")}
        />
      </SettingsGroup>

      <SettingsGroup title={t("launcher.settings.sdk.featuresTitle")}>
        {FEATURES.map(({ feature, icon }) => {
          const current = featureStatus(capabilities, feature);
          return (
            <SettingsRow
              key={feature}
              icon={`fa-solid ${icon}`}
              label={t(`capabilities.features.${feature}.label`)}
              description={t(`capabilities.features.${feature}.description`)}
              control={
                current ? (
                  current.available ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-(--success)/10 px-2 py-0.5 text-[11.5px] font-semibold text-(--success)">
                      <i className="fa-solid fa-check text-[10px]" />
                      {t("capabilities.available")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-(--warning)/10 px-2 py-0.5 text-[11.5px] font-semibold text-(--warning)">
                      {t("capabilities.requires", { version: current.required_version })}
                    </span>
                  )
                ) : null
              }
            />
          );
        })}
      </SettingsGroup>

      <SdkInfoModal open={showInfo} onClose={() => setShowInfo(false)} />
    </SettingsPage>
  );
}
