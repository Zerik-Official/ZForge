import { useCallback, useEffect, useState } from "react";
import { TitleBar } from "@/components/layout/TitleBar";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { LanguageSelector } from "@/components/LanguageSelector";
import { LauncherView } from "@/features/launcher/LauncherView";
import { ConfigConflictModal } from "@/features/launcher/ConfigConflictModal";
import { useBridge } from "@/hooks/useBridge";
import { useBootEvents } from "@/hooks/useBootEvents";
import { useConfigConflict } from "@/hooks/useConfigConflict";
import { useGamesStore } from "@/store/gamesStore";
import { api } from "@/services/api";
import { setLocale, type Locale } from "@/locales/i18n";
import type { AppConfig } from "@/types/domains/settings";

export default function App() {
  const { ready: bridgeReady } = useBridge();
  const { step, done: bootDone } = useBootEvents();
  const { conflicts, resolve } = useConfigConflict();
  const hydrate = useGamesStore((state) => state.hydrate);

  /** True once the splash fade-out transition ends. */
  const [splashGone, setSplashGone] = useState(false);

  /** Language gate — null until we know if the user has chosen one. */
  const [languageChecked, setLanguageChecked] = useState(false);
  const [needsLanguage, setNeedsLanguage] = useState(false);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  /**
   * Resolve language as soon as the bridge is ready.
   * If no language is stored, show the selector and defer hydration.
   */
  useEffect(() => {
    if (!bridgeReady) return;

    let cancelled = false;

    void (async () => {
      try {
        const config = (await api.getAppConfig()) as AppConfig;
        if (cancelled) return;

        setAppConfig(config);

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
  }, [bridgeReady]);

  /** Load persisted games/assets/config once language is resolved. */
  useEffect(() => {
    if (!bridgeReady || !languageChecked || needsLanguage) return;
    void hydrate();
  }, [bridgeReady, languageChecked, needsLanguage, hydrate]);

  const handleSelectLanguage = useCallback(
    async (locale: Locale) => {
      setLocale(locale);
      
      const base: AppConfig = appConfig ?? { theme: "dark", last_active_game: null, language: null };
      const next: AppConfig = { ...base, language: locale };

      try {
        await api.saveAppConfig(next);
        setAppConfig(next);
      } catch {

        setAppConfig(next);
      }

      setNeedsLanguage(false);

    },
    [appConfig],
  );

  const showLanguageSelector = bridgeReady && languageChecked && needsLanguage;

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
          bridgeReady={bridgeReady}
          step={step}
          bootDone={bootDone}
          onDone={() => setSplashGone(true)}
        />
      )}

      {showLanguageSelector && <LanguageSelector onSelect={handleSelectLanguage} />}
      <TitleBar bridgeReady={bridgeReady} />

      <main
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          opacity: splashGone && !showLanguageSelector ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      >
        <LauncherView />
      </main>

      {conflicts[0] && (
        <ConfigConflictModal conflict={conflicts[0]} onResolve={resolve} />
      )}
    </div>
  );
}
