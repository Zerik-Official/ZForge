import { useCallback, useEffect, useState } from "react";
import { WindowBar } from "@/components/layout/WindowBar";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { LanguageSelector } from "@/components/LanguageSelector";
import { LauncherShell } from "@/features/launcher/LauncherShell";
import { ConfigConflictModal } from "@/features/game-settings/ConfigConflictModal";
import { useBoot } from "@/hooks/useBoot";
import { useConfigConflict } from "@/hooks/useConfigConflict";
import { useNotificationStrings } from "@/hooks/useNotificationStrings";
import { usePresenceStrings } from "@/hooks/usePresenceStrings";
import { useTrayStrings } from "@/hooks/useTrayStrings";
import { useGamesStore } from "@/store/gamesStore";
import { useThemeStore } from "@/store/themeStore";
import { api, assetsApi } from "@/services/api";
import { setResourcesDir } from "@/utils/asset";
import { setLocale, type Locale } from "@/locales/i18n";

export default function App() {
  const { conflicts, push: pushConflicts, resolve } = useConfigConflict();
  const { step, done: bootDone, download } = useBoot(pushConflicts);
  usePresenceStrings();
  useTrayStrings();
  useNotificationStrings();
  const hydrate = useGamesStore((state) => state.hydrate);
  const loadTheme = useThemeStore((state) => state.load);

  useEffect(() => {
    void loadTheme();
  }, [loadTheme]);

  /** True once the splash fade-out transition ends. */
  const [splashGone, setSplashGone] = useState(false);
  const handleSplashDone = useCallback(() => setSplashGone(true), []);

  /** Language gate — null until we know if the user has chosen one. */
  const [languageChecked, setLanguageChecked] = useState(false);
  const [needsLanguage, setNeedsLanguage] = useState(false);

  /**
   * Resolve the language on startup.
   * If no language is stored, show the selector and defer hydration.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [config, resourcesDir] = await Promise.all([api.getAppConfig(), assetsApi.getResourcesDir()]);
        if (cancelled) return;
        setResourcesDir(resourcesDir);

        const lang = config.language as Locale | null;
        if (lang === "en" || lang === "es") {
          setLocale(lang);
          setNeedsLanguage(false);
        } else {
          setNeedsLanguage(true);
        }
      } catch {
        if (!cancelled) setNeedsLanguage(true);
      } finally {
        if (!cancelled) setLanguageChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Load persisted games/assets/config once language is resolved. */
  useEffect(() => {
    if (!languageChecked || needsLanguage) return;
    void hydrate();
  }, [languageChecked, needsLanguage, hydrate]);

  const handleSelectLanguage = useCallback(
    async (locale: Locale) => {
      setLocale(locale);
      try {
        await api.saveAppConfig({ language: locale });
      } catch (error) {
        console.error("Could not save the language", error);
      }
      setNeedsLanguage(false);
    },
    [],
  );

  const showLanguageSelector = languageChecked && needsLanguage;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        height: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        overflow: "hidden",
      }}
    >
      {!splashGone && !showLanguageSelector && (
        <SplashScreen
          download={download}
          step={step}
          bootDone={bootDone}
          onDone={handleSplashDone}
        />
      )}

      {showLanguageSelector && <LanguageSelector onSelect={handleSelectLanguage} />}
      <WindowBar />

      <main
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          opacity: splashGone && !showLanguageSelector ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      >
        {/* Mounted after the boot so the media downloaded during it already exist. */}
        {bootDone ? <LauncherShell /> : null}
      </main>

      {conflicts[0] && (
        <ConfigConflictModal conflict={conflicts[0]} onResolve={resolve} />
      )}
    </div>
  );
}