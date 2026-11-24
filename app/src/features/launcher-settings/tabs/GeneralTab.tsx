import { useEffect, useState } from "react";
import { ES, US } from "country-flag-icons/react/3x2";
import { PageState } from "@/components/layout/PageState";
import { SettingsGroup, SettingsPage, SettingsRow } from "@/components/layout/SettingsPage";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select, type SelectOption } from "@/components/ui/Select";
import { t, useLocale, setLocale, type Locale, SUPPORTED_LOCALES } from "@/locales/i18n";
import { api, errorCode } from "@/services/api";
import { useGamesStore } from "@/store/gamesStore";
import type { AppConfig } from "@/types/domains/settings";

/**
 * General launcher preferences tab.
 *
 * Display language (applied instantly with `setLocale`), whether the home dock can be
 * reordered, and what closing the window does.
 *
 * @example
 * ```tsx
 * <GeneralTab />
 * ```
 */
export function GeneralTab() {
  useLocale();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveConfig = useGamesStore((state) => state.saveConfig);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await api.getAppConfig();
        if (!cancelled) {
          setConfig(cfg);
          if (cfg.language && SUPPORTED_LOCALES.includes(cfg.language as Locale)) {
            setLocale(cfg.language as Locale);
          }
        }
      } catch {
        if (!cancelled)
          setConfig({ theme: "dark", last_active_game: null, language: null, discord_enabled: false, discord_auto_update: true, sdk_last_error: null } as AppConfig);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLanguageChange(value: string) {
    if (!SUPPORTED_LOCALES.includes(value as Locale)) return;
    const locale = value as Locale;
    setSaving(true);
    try {
      setConfig(await api.saveAppConfig({ language: locale }));
      setLocale(locale);
    } finally {
      setSaving(false);
    }
  }

  async function savePreference(patch: Partial<AppConfig>) {
    try {
      setConfig(await saveConfig(patch));
      setError(null);
    } catch (e) {
      setError(t(`common.errors.codes.${errorCode(e)}`));
    }
  }

  const closeOptions: SelectOption[] = [
    { value: "tray", label: t("launcher.settings.general.closeToTray") },
    { value: "quit", label: t("launcher.settings.general.closeQuit") },
  ];

  const languageOptions: SelectOption[] = [
    {
      value: "en",
      label: "English",
      thumb: <US aria-hidden className="h-full w-full object-cover" />,
    },
    {
      value: "es",
      label: "Español",
      thumb: <ES aria-hidden className="h-full w-full object-cover" />,
    },
  ];

  const currentLanguage =
    config?.language && SUPPORTED_LOCALES.includes(config.language as Locale) ? config.language : "en";

  if (!loaded) {
    return <PageState error={null} />;
  }

  return (
    <SettingsPage title={t("launcher.settings.general.title")} description={t("launcher.settings.general.description")}>
      <SettingsGroup>
        <SettingsRow
          label={t("launcher.settings.general.language")}
          description={saving ? t("common.saving") : t("launcher.settings.general.languageDescription")}
          control={
            <div className="w-56">
              <Select
                value={currentLanguage}
                options={languageOptions}
                onChange={handleLanguageChange}
                placeholder={t("launcher.settings.general.language")}
              />
            </div>
          }
        />
      </SettingsGroup>

      <SettingsGroup title={t("launcher.settings.general.behavior")}>
        <Checkbox
          layout="row"
          checked={config?.dock_reorder ?? true}
          onChange={(value) => void savePreference({ dock_reorder: value })}
          label={t("launcher.settings.general.dockReorder")}
          description={t("launcher.settings.general.dockReorderDescription")}
        />
        <SettingsRow
          label={t("launcher.settings.general.closeAction")}
          description={t("launcher.settings.general.closeActionDescription")}
          control={
            <div className="w-56">
              <Select
                value={config?.close_to_tray ? "tray" : "quit"}
                options={closeOptions}
                onChange={(value) => void savePreference({ close_to_tray: value === "tray" })}
              />
            </div>
          }
        />
      </SettingsGroup>

      {error ? <span className="text-[12.5px] text-(--danger)">{error}</span> : null}
    </SettingsPage>
  );
}
