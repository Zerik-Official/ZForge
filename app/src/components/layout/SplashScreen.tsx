/**
 * SplashScreen
 *
 * Shown on startup before the main layout appears.
 * Lifecycle:
 *   1. Renders immediately — logo animates in, spinner visible.
 *   2. Once the pywebview bridge connects, useBootEvents starts
 *      receiving backend messages and progress updates.
 *   3. When the backend emits boot_done, the bar hits 100 %,
 *      and the splash fades out via CSS transition.
 *
 * The component stays mounted during the fade-out (opacity → 0)
 * and is unmounted by the parent once `onDone` fires.
 *
 * Props:
 *   bridgeReady  — whether the pywebview bridge is callable.
 *   step         — latest boot step { message, percent } from the backend.
 *   bootDone     — true once the backend signals completion.
 *   onDone       — called after the fade-out animation ends.
 */

import { useEffect, useState, useRef } from "react";
import type { BootStep } from "@/hooks/useBootEvents";
import "@/styles/splash.css";

interface SplashScreenProps {
  bridgeReady: boolean;
  step: BootStep;
  bootDone: boolean;
  onDone: () => void;
}

export function SplashScreen({
  bridgeReady,
  step,
  bootDone,
  onDone,
}: SplashScreenProps) {
  /** Controls the CSS fade-out class. */
  const [hiding, setHiding] = useState(false);

  /**
   * Tracks the message key so React re-mounts the element on every new
   * message, re-triggering the CSS entry animation.
   */
  const msgKeyRef = useRef(0);
  const [msgKey, setMsgKey] = useState(0);

  // Bump the key whenever the message changes so the animation replays.
  const prevMsg = useRef(step.message);
  if (step.message !== prevMsg.current) {
    prevMsg.current = step.message;
    msgKeyRef.current += 1;
  }

  // Sync the key to state on every render (safe — same value if no change).
  useEffect(() => {
    setMsgKey(msgKeyRef.current);
  }, [step.message]);

  // Kick off fade-out when boot is done.
  useEffect(() => {
    if (!bootDone) return;

    // Small pause at 100 % so the user sees it complete before hiding.
    const delay = setTimeout(() => setHiding(true), 600);
    return () => clearTimeout(delay);
  }, [bootDone]);

  // Fire onDone after the CSS transition finishes.
  const handleTransitionEnd = () => {
    if (hiding) onDone();
  };

  return (
    <div
      className={`splash${hiding ? " splash--hidden" : ""}`}
      onTransitionEnd={handleTransitionEnd}
    >
      {/* ── Center content ──────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "24px",
        }}
      >
        {/* Logo */}
        <img
          className="splash__logo"
          src="/assets/app/logo.svg"
          alt="ZForge"
          draggable={false}
        />

        {/* Spinner — hidden once the bridge is ready and messages start */}
        <div
          className={`splash__spinner${bridgeReady ? " splash__spinner--hidden" : ""}`}
        />

        {/* Messages */}
        <div className="splash__messages">
          <p key={msgKey} className="splash__message">
            {step.message}
          </p>
        </div>
      </div>

      {/* ── Bottom: progress bar ────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "10px",
          width: "260px",
        }}
      >
        <div className="splash__bar-track">
          <div
            className="splash__bar-fill"
            style={{ width: `${step.percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}