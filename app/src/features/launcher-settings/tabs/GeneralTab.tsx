import { useEffect, useState } from "react";
import { ES, US } from "country-flag-icons/react/3x2";
import { PageState } from "@/components/layout/PageState";
import { SettingsGroup, SettingsPage, SettingsRow } from "@/components/layout/SettingsPage";
import { Select, type SelectOption } from "@/components/ui/Select";
import { t, useLocale, setLocale, type Locale, SUPPORTED_LOCALES } from "@/locales/i18n";
import { api } from "@/services/api";
import type { AppConfig } from "@/types/domains/settings";

/**
 * General launcher preferences tab.
 *
 * Currently exposes the display language selector (`Bandera | String`).
 * Persisted via `AppConfig.language` and applied instantly with `setLocale`.
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

  const languageOptions: SelectOption[] = [
    {
      value: "en",
      label: "English",
      thumb: <US title="English" className="h-full w-full object-cover" />,
    },
    {
      value: "es",
      label: "Español",
      thumb: <ES title="Español" className="h-full w-full object-cover" />,
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
    </SettingsPage>
  );
}
