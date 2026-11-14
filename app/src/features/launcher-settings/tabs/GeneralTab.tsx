import { useEffect, useState } from "react";
import { ES, US } from "country-flag-icons/react/3x2";
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
    return (
      <div className="flex flex-1 items-center justify-center text-(--muted)">
        <i className="fa-solid fa-spinner fa-spin text-[18px]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold text-(--text)">{t("launcher.settings.general.title")}</h2>
        <p className="text-[12px] text-(--muted)">{t("launcher.settings.general.description")}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-(--border-strong) bg-(--bg-card) p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-(--text-soft)">{t("launcher.settings.general.language")}</span>
            <span className="text-[11px] text-(--muted)">{t("launcher.settings.general.languageDescription")}</span>
          </div>
          <div className="w-56 shrink-0">
            <Select
              value={currentLanguage}
              options={languageOptions}
              onChange={handleLanguageChange}
              placeholder={t("launcher.settings.general.language")}
            />
          </div>
        </div>
        {saving ? (
          <span className="flex items-center gap-1.5 text-[11px] text-(--muted)">
            <i className="fa-solid fa-spinner fa-spin" /> {t("common.saving")}
          </span>
        ) : null}
      </div>
    </div>
  );
}