import { useState } from "react";
import { TitleBar } from "@/components/layout/TitleBar";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { useBridge } from "@/hooks/useBridge";
import { useBootEvents } from "@/hooks/useBootEvents";

export default function App() {
  const { ready: bridgeReady } = useBridge();
  const { step, done: bootDone } = useBootEvents();

  /** True once the splash fade-out transition ends. */
  const [splashGone, setSplashGone] = useState(false);

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
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-soft)",
          opacity: splashGone ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />
    </div>
  );
}