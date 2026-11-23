import { VscChromeMinimize, VscChromeClose } from "react-icons/vsc";
import { api } from "@/services/api";
import { t, useLocale } from "@/locales/i18n";

/**
 * Minimize and close buttons of the frameless window, above every screen so the window
 * can always be closed. The bar itself lets clicks through; each screen marks its own
 * area for dragging the window.
 */
export function WindowBar() {
  useLocale();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-60 flex h-10 items-center justify-end px-2 select-none">
      <button
        className="pointer-events-auto flex h-7 w-8.5 items-center justify-center rounded-md text-(--muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text) cursor-pointer"
        aria-label={t("launcher.window.minimize")}
        onClick={() => void api.minimizeWindow()}
      >
        <VscChromeMinimize size={13} />
      </button>
      <button
        className="pointer-events-auto flex h-7 w-8.5 items-center justify-center rounded-md text-(--muted) transition-colors hover:bg-(--danger) hover:text-(--on-primary) cursor-pointer"
        aria-label={t("launcher.window.close")}
        onClick={() => void api.closeWindow()}
      >
        <VscChromeClose size={13} />
      </button>
    </div>
  );
}
