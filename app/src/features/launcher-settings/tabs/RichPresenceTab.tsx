import { useCallback, useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { t, useLocale } from "@/locales/i18n";
import { api } from "@/services/api";
import type { SdkDownloadProgress, SdkStatus } from "@/types/domains/sdk";
import type { AppConfig } from "@/types/domains/settings";
import { formatBytes, formatEta, formatSpeed } from "@/utils/formatters";

function cleanVersion(v: string | null | undefined): string {
  if (!v) return "";
  return v.replace(/^v/i, "");
}

/**
 * Rich Presence settings tab.
 */
export function RichPresenceTab() {
  useLocale();
  const [status, setStatus] = useState<SdkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<SdkDownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getSdkStatus();
      setStatus(s);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = (await api.getAppConfig()) as AppConfig;
      setAppConfig(cfg);
    } catch {
      setAppConfig(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await Promise.all([refreshStatus(), refreshConfig()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshStatus, refreshConfig]);

  useEffect(() => {
    function handleProgress(payload: SdkDownloadProgress) {
      setProgress(payload);
      setDownloading(true);
    }
    window.__zforge_sdk_download_progress = handleProgress;
    return () => {
      delete window.__zforge_sdk_download_progress;
    };
  }, []);

  async function handleInstall() {
    setDownloading(true);
    setProgress({ percent: 0, downloaded: 0, total: 0, speed: 0, eta: 0, version: status?.latest_version ?? "" });
    setError(null);
    try {
      const result = await api.installSdk();
      if (!result.ok) {
        setError((result.error as string) ?? "Download failed");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(false);
      setProgress(null);
      await refreshStatus();
      await refreshConfig();
    }
  }

  async function handleToggleDiscord(value: boolean) {
    const base: AppConfig =
      appConfig ??
      ({ theme: "dark", last_active_game: null, language: null, discord_enabled: false, discord_auto_update: true, sdk_last_error: null } as AppConfig);
    const next: AppConfig = { ...base, discord_enabled: value };
    await api.saveAppConfig(next);
    setAppConfig(next);
    setStatus((prev) => (prev ? { ...prev, discord_enabled: value } : prev));
  }

  async function handleToggleAutoUpdate(value: boolean) {
    const base: AppConfig =
      appConfig ??
      ({ theme: "dark", last_active_game: null, language: null, discord_enabled: false, discord_auto_update: true, sdk_last_error: null } as AppConfig);
    const next: AppConfig = { ...base, discord_auto_update: value };
    await api.saveAppConfig(next);
    setAppConfig(next);
    setStatus((prev) => (prev ? { ...prev, discord_auto_update: value } : prev));
  }

  const showErrorBanner = useMemo(() => {
    const msg = status?.sdk_last_error;
    if (!msg) return null;
    return msg;
  }, [status]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-(--muted)">
        <i className="fa-solid fa-spinner fa-spin text-[18px]" />
      </div>
    );
  }

  const needsInstall = status?.needs_install ?? false;
  const needsRepair = status?.needs_repair ?? false;
  const needsAppId = !status?.application_id_configured;
  const validAndConfigured = status?.valid && status?.application_id_configured && !needsInstall && !needsRepair;

  return (
    <div className="flex flex-col gap-4 p-8">
      {showErrorBanner ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <i className="fa-solid fa-triangle-exclamation mt-0.5 text-[13px] text-amber-500" />
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-amber-500">{t("launcher.settings.richPresence.corruptionError")}</span>
            <span className="text-[11px] leading-relaxed text-(--muted)">{showErrorBanner}</span>
          </div>
        </div>
      ) : null}

      {needsInstall || needsRepair ? (
        <div className="flex flex-col gap-4 rounded-xl border border-(--border-strong) bg-(--bg-card) p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--border-strong) bg-(--bg-elevated)">
              <i className="fa-solid fa-cube text-[14px] text-(--muted)" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-[13px] font-semibold text-(--text)">
                {needsRepair ? t("launcher.settings.richPresence.sdkCorrupted.title") : t("launcher.settings.richPresence.sdkNotFound.title")}
              </h3>
              <p className="max-w-xl text-[12px] leading-relaxed text-(--muted)">
                {needsRepair ? t("launcher.settings.richPresence.sdkCorrupted.description") : t("launcher.settings.richPresence.sdkNotFound.description")}
              </p>
              {status?.version ? (
                <span className="text-[11px] text-(--muted-2)">{t("launcher.settings.richPresence.version.installed", { version: cleanVersion(status.version) })}</span>
              ) : null}
              {status?.latest_version ? (
                <span className="text-[11px] text-(--muted-2)">{t("launcher.settings.richPresence.version.latest", { version: cleanVersion(status.latest_version) })}</span>
              ) : null}
              {status?.missing_files && status.missing_files.length > 0 ? (
                <span className="text-[11px] text-(--danger)">Missing: {status.missing_files.join(", ")}</span>
              ) : null}
            </div>
          </div>

          {downloading && progress ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] text-(--muted)">
                <span>{t("launcher.settings.richPresence.sdkNotFound.downloading")}</span>
                <span>{progress.percent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-(--bg-input) border border-(--border-strong)">
                <div className="h-full bg-(--primary) transition-all duration-200" style={{ width: `${progress.percent}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-(--muted-2)">
                <span>{t("launcher.settings.richPresence.progress.downloaded", { downloaded: formatBytes(progress.downloaded), total: progress.total ? formatBytes(progress.total) : "—" })}</span>
                <span className="flex items-center gap-2">
                  <span>{t("launcher.settings.richPresence.progress.speed", { speed: formatSpeed(progress.speed) })}</span>
                  <span>·</span>
                  <span>{t("launcher.settings.richPresence.progress.remaining", { time: formatEta(progress.eta) })}</span>
                </span>
              </div>
            </div>
          ) : (
            <button
              className="flex w-fit items-center gap-2 rounded-lg bg-[linear-gradient(160deg,var(--primary-hover),var(--primary-active))] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_0_20px_var(--primary-glow)] hover:brightness-105 cursor-pointer disabled:opacity-50"
              onClick={handleInstall}
              disabled={downloading}
            >
              <i className="fa-solid fa-download text-[12px]" />
              {needsRepair ? t("launcher.settings.richPresence.sdkCorrupted.repair") : t("launcher.settings.richPresence.sdkNotFound.download")}
            </button>
          )}

          {error ? <span className="text-[12px] text-(--danger)">{error}</span> : null}
        </div>
      ) : null}

      {status?.valid && needsAppId ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <i className="fa-solid fa-circle-info mt-0.5 text-[13px] text-amber-500" />
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-amber-500">{t("launcher.settings.richPresence.applicationIdMissing.title")}</span>
            <span className="text-[11px] leading-relaxed text-(--muted)">{t("launcher.settings.richPresence.applicationIdMissing.description")}</span>
          </div>
        </div>
      ) : null}

      {validAndConfigured ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[13px] font-semibold text-(--text)">{t("launcher.settings.richPresence.title")}</h2>
            <p className="text-[11px] text-(--muted)">
              {status?.version ? t("launcher.settings.richPresence.version.installed", { version: cleanVersion(status.version) }) : null}
              {status?.latest_version ? ` · ${t("launcher.settings.richPresence.version.latest", { version: cleanVersion(status.latest_version) })}` : null}
              {status?.update_available ? ` · ${t("launcher.settings.richPresence.version.updateAvailable")}` : null}
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-(--border-strong) bg-(--bg-card) p-5">
            <Checkbox
              checked={!!status?.discord_enabled}
              onChange={handleToggleDiscord}
              label={t("launcher.settings.richPresence.settings.enableDiscord")}
            />
            <span className="ml-6 text-[11px] text-(--muted)">{t("launcher.settings.richPresence.settings.enableDiscordDescription")}</span>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-(--border-strong) bg-(--bg-card) p-5">
            <Checkbox
              checked={!!status?.discord_auto_update}
              onChange={handleToggleAutoUpdate}
              label={t("launcher.settings.richPresence.settings.autoUpdate")}
            />
            <span className="ml-6 text-[11px] text-(--muted)">{t("launcher.settings.richPresence.settings.autoUpdateDescription")}</span>
          </div>
        </div>
      ) : null}

      {!validAndConfigured && !needsInstall && !needsRepair && status?.valid && !needsAppId ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-(--border-strong) bg-(--bg-card)">
            <i className="fa-brands fa-discord text-xl text-(--muted-2)" />
          </div>
          <h3 className="text-[14px] font-semibold text-(--text)">{t("launcher.settings.richPresence.title")}</h3>
          <p className="max-w-sm text-[12px] leading-relaxed text-(--muted)">{t("launcher.settings.richPresence.empty")}</p>
          <span className="rounded-full border border-(--border-strong) bg-(--bg-elevated) px-3 py-1 text-[11px] font-medium text-(--muted)">
            {t("common.comingSoon")}
          </span>
        </div>
      ) : null}
    </div>
  );
}