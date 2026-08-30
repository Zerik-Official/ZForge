import { useEffect, useState } from "react";
import { TitleBar } from "@/components/layout/TitleBar";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { LauncherView } from "@/features/launcher/LauncherView";
import { ConfigConflictModal } from "@/features/launcher/ConfigConflictModal";
import { useBridge } from "@/hooks/useBridge";
import { useBootEvents } from "@/hooks/useBootEvents";
import { useConfigConflict } from "@/hooks/useConfigConflict";
import { useGamesStore } from "@/store/gamesStore";

export default function App() {
  const { ready: bridgeReady } = useBridge();
  const { step, done: bootDone } = useBootEvents();
  const { conflicts, resolve } = useConfigConflict();
  const hydrate = useGamesStore((state) => state.hydrate);

  /** True once the splash fade-out transition ends. */
  const [splashGone, setSplashGone] = useState(false);

  /** Load persisted games/assets/config once the Python bridge is ready. */
  useEffect(() => {
    if (bridgeReady) {
      void hydrate();
    }
  }, [bridgeReady, hydrate]);

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
      {/* ── Splash screen (unmounted after fade-out) ───────────── */}
      {!splashGone && (
        <SplashScreen
          bridgeReady={bridgeReady}
          step={step}
          bootDone={bootDone}
          onDone={() => setSplashGone(true)}
        />
      )}

      {/* ── Main layout (rendered underneath splash) ───────────── */}
      <TitleBar bridgeReady={bridgeReady} />

      <main
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          opacity: splashGone ? 1 : 0,
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