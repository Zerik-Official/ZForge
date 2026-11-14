import { VscChromeMinimize, VscChromeClose } from "react-icons/vsc";
import { api } from "@/services/api";

/**
 * Properties for the {@link TitleBar} component.
 */
interface TitleBarProps {
  /** Application name displayed beside the logo. @default import.meta.env.VITE_APP_NAME ?? "ZForge" */
  title?: string;
}

/**
 * Custom frameless window title bar.
 *
 * The bar is a Tauri drag region (`data-tauri-drag-region`); the window
 * controls sit outside it so they stay clickable.
 *
 * @example
 * ```tsx
 * <TitleBar title="ZForge" />
 * ```
 */
export function TitleBar({ title = import.meta.env.VITE_APP_NAME ?? "ZForge" }: TitleBarProps) {
  const handleMinimize = () => {
    void api.minimizeWindow();
  };
  const handleClose = () => {
    void api.closeWindow();
  };

  return (
    <header
      data-tauri-drag-region
      className="h-10 px-3.5 flex items-center justify-between bg-(--bg) border-b border-(--border) select-none shrink-0"
    >
      {/* ── Left: logo + name ──────────────────────────────────────── */}
      <div data-tauri-drag-region className="flex items-center gap-2">
        <img
          src="/assets/app/logo.svg"
          alt={title}
          width={24}
          height={24}
          draggable={false}
          className="shrink-0 pointer-events-none"
        />

        <span
          data-tauri-drag-region
          className="text-[12px] font-semibold tracking-widest text-(--text-soft) uppercase"
        >
          {title}
        </span>
      </div>

      {/* ── Right: window controls (excluded from drag region) ──────── */}
      <div className="flex items-center gap-0.5">
        <button
          className="flex h-7 w-7 items-center justify-center rounded text-(--muted) hover:bg-(--bg-hover) hover:text-(--text) cursor-pointer transition-colors"
          aria-label="Minimize"
          onClick={handleMinimize}
        >
          <VscChromeMinimize size={13} />
        </button>

        <button
          className="flex h-7 w-7 items-center justify-center rounded text-(--muted) hover:bg-red-500 hover:text-white cursor-pointer transition-colors"
          aria-label="Close"
          onClick={handleClose}
        >
          <VscChromeClose size={13} />
        </button>
      </div>
    </header>
  );
}
