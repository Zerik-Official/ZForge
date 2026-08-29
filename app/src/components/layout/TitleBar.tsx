/**
 * TitleBar
 *
 * Custom frameless window title bar.
 * - Drag region via `pywebview-drag-region` class.
 * - Window controls: minimize / close (maximize intentionally omitted).
 * - Bridge status dot shown only in development builds.
 * - App logo loaded from /assets/app/logo.svg (public folder).
 * - Hover states handled with CSS classes, never by mutating el.style.
 */

import { VscChromeMinimize, VscChromeClose } from "react-icons/vsc";
import { api } from "@/services/api";
import "@/styles/titlebar.css";

const IS_DEV = import.meta.env.DEV;

interface TitleBarProps {
  /** Application name shown beside the logo. */
  title?: string;
  /** Whether the bridge is ready (disables controls while loading). */
  bridgeReady?: boolean;
}

export function TitleBar({
  title = import.meta.env.VITE_APP_NAME ?? "ZForge",
  bridgeReady = false,
}: TitleBarProps) {
  const handleMinimize = () => { if (bridgeReady) api.minimizeWindow(); };
  const handleClose    = () => { if (bridgeReady) api.closeWindow(); };

  return (
    <header
      className="pywebview-drag-region"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "40px",
        paddingInline: "14px",
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {/* ── Left: logo + name + status dot ─────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <img
          src="/assets/app/logo.svg"
          alt={title}
          width={24}
          height={24}
          draggable={false}
          style={{ flexShrink: 0 }}
        />

        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: "var(--text-soft)",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>

        {/* Status dot — development only */}
        {IS_DEV && (
          <span
            title={bridgeReady ? "Bridge connected" : "Connecting…"}
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              background: bridgeReady ? "var(--success)" : "var(--muted-3)",
              transition: "background 0.4s ease",
              flexShrink: 0,
            }}
          />
        )}
      </div>

      {/* ── Right: window controls (excluded from drag region) ──────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
        <button
          className="titlebar-btn"
          aria-label="Minimize"
          disabled={!bridgeReady}
          onClick={handleMinimize}
        >
          <VscChromeMinimize size={13} />
        </button>

        <button
          className="titlebar-btn titlebar-btn--close"
          aria-label="Close"
          disabled={!bridgeReady}
          onClick={handleClose}
        >
          <VscChromeClose size={13} />
        </button>
      </div>
    </header>
  );
}