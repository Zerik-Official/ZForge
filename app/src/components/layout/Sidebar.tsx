import { useEffect, useRef, useState } from "react";
import { Sigil } from "@/components/brand/Sigil";
import { TooltipSimple } from "@/components/ui/Tooltip";
import type { LauncherSettingsTab } from "@/features/launcher-settings/LauncherSettingsView";
import { useSession } from "@/hooks/useSession";
import { t, useLocale } from "@/locales/i18n";
import { useGamesStore } from "@/store/gamesStore";
import { toDisplaySrc } from "@/utils/asset";

export type View = "home" | "games" | "addons" | "settings";

/** How much room the sidebar takes: full width with labels, or a rail of icons. */
export type SidebarWidth = "expanded" | "collapsed";

interface SidebarProps {
  view: View;
  settingsTab: LauncherSettingsTab;
  width: SidebarWidth;
  onSelect: (view: View) => void;
  onSelectSettings: (tab: LauncherSettingsTab) => void;
  onToggleWidth: () => void;
  onHide: () => void;
}

const SETTINGS_TABS: LauncherSettingsTab[] = ["general", "appearance", "accounts", "notifications", "richPresence", "sdk"];

const itemBase =
  "relative flex items-center gap-3 rounded-[7px] text-left transition-colors cursor-pointer";

function itemState(active: boolean): string {
  return active
    ? "bg-(--bg-hover) text-(--text) before:absolute before:-left-3 before:top-2.25 before:bottom-2.25 before:w-0.5 before:rounded-r-sm before:bg-(--primary)"
    : "text-(--muted) hover:bg-(--bg-card) hover:text-(--text-soft)";
}

const iconButton =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] text-(--muted-2) transition-colors hover:bg-(--bg-hover) hover:text-(--text) cursor-pointer";

/**
 * Main navigation: brand, views, the settings sections and the state of the active game.
 *
 * Expanded it shows labels and unfolds the settings sections under their entry. Collapsed it
 * is a rail of icons with tooltips, and the settings sections open in a menu beside the rail.
 */
export function Sidebar({ view, settingsTab, width, onSelect, onSelectSettings, onToggleWidth, onHide }: SidebarProps) {
  useLocale();
  const games = useGamesStore((state) => state.games);
  const activeId = useGamesStore((state) => state.activeId);
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const collapsed = width === "collapsed";
  const active = games.find((game) => game.id === activeId) ?? games[0] ?? null;
  const settingsOpen = view === "settings";
  const sessionGame = session && session.phase !== "idle" ? games.find((game) => game.id === session.game_id) : undefined;
  const statusGame = sessionGame ?? active;
  const running = sessionGame !== undefined && session !== null;
  const statusText = running ? t(`launcher.sidebar.phase.${session.phase}`) : t("launcher.sidebar.ready");

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointer(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const mainItems: { key: View; icon: string; label: string }[] = [
    { key: "home", icon: "fa-solid fa-house", label: t("launcher.sidebar.home") },
    { key: "games", icon: "fa-solid fa-gamepad", label: t("launcher.sidebar.games") },
    { key: "addons", icon: "fa-solid fa-puzzle-piece", label: t("launcher.sidebar.addons") },
  ];

  function withTooltip(label: string, node: React.ReactElement) {
    if (!collapsed) return node;
    return (
      <TooltipSimple key={label} content={label} side="right" align="center" sideOffset={12}>
        {node}
      </TooltipSimple>
    );
  }

  const rowSize = collapsed ? "h-9 w-10 justify-center" : "h-9 w-full px-2.5";

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-(--border) bg-(--bg-soft) transition-[width] duration-200 ease-out ${
        collapsed ? "w-16" : "w-58"
      }`}
    >
      <div
        data-tauri-drag-region
        className={`flex h-14 shrink-0 items-center select-none ${collapsed ? "justify-center px-0" : "gap-2.5 pr-3 pl-5"}`}
      >
        <Sigil size={24} strokeWidth={7} className="pointer-events-none shrink-0 text-(--primary)" />
        {collapsed ? null : (
          <>
            <span
              data-tauri-drag-region
              className="min-w-0 flex-1 truncate text-[16px] font-[650] tracking-[-0.01em] text-(--text) [font-family:var(--font-heading,inherit)] [font-stretch:125%]"
            >
              {import.meta.env.VITE_APP_NAME ?? "ZForge"}
            </span>
            <TooltipSimple content={`${t("launcher.sidebar.hide")} (Ctrl+B)`} side="bottom" align="center">
              <button className={iconButton} onClick={onHide} aria-label={t("launcher.sidebar.hide")}>
                <i className="fa-solid fa-eye-slash" />
              </button>
            </TooltipSimple>
            <TooltipSimple content={t("launcher.sidebar.collapse")} side="bottom" align="center">
              <button className={iconButton} onClick={onToggleWidth} aria-label={t("launcher.sidebar.collapse")}>
                <i className="fa-solid fa-angles-left" />
              </button>
            </TooltipSimple>
          </>
        )}
      </div>

      <nav className={`flex flex-col gap-0.5 py-2 ${collapsed ? "items-center px-0" : "px-3"}`} aria-label={t("launcher.sidebar.navigation")}>
        {mainItems.map((item) =>
          withTooltip(
            item.label,
            <button
              key={item.key}
              className={`${itemBase} ${rowSize} text-[13.5px] font-medium ${itemState(view === item.key)} ${collapsed ? "before:-left-3" : ""}`}
              aria-current={view === item.key ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              onClick={() => onSelect(item.key)}
            >
              <i className={`${item.icon} w-4.5 text-center text-[14px]`} />
              {collapsed ? null : item.label}
            </button>,
          ),
        )}
      </nav>

      <div className="mx-3 my-2 h-px bg-(--border)" />

      <nav className={`flex flex-col gap-0.5 py-2 ${collapsed ? "items-center px-0" : "px-3"}`} aria-label={t("launcher.sidebar.settings")}>
        {collapsed ? (
          <div className="relative" ref={settingsRef}>
            {withTooltip(
              t("launcher.sidebar.settings"),
              <button
                className={`${itemBase} ${rowSize} text-[13.5px] font-medium ${itemState(settingsOpen)}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t("launcher.sidebar.settings")}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <i className="fa-solid fa-sliders w-4.5 text-center text-[14px]" />
              </button>,
            )}
            {menuOpen ? (
              <div
                role="menu"
                className="absolute top-0 left-full z-40 ml-3 flex w-52 flex-col gap-px rounded-(--radius) border border-(--border-strong) bg-(--bg-elevated) p-1.5 shadow-(--shadow-lg) animate-[popIn_0.15s_ease_both]"
              >
                <span className="px-2.5 pt-1.5 pb-2 text-[12.5px] font-semibold text-(--text-soft)">{t("launcher.sidebar.settings")}</span>
                {SETTINGS_TABS.map((tab) => {
                  const current = settingsOpen && settingsTab === tab;
                  return (
                    <button
                      key={tab}
                      role="menuitem"
                      className={`flex h-8 items-center rounded-md px-2.5 text-left text-[13px] transition-colors cursor-pointer ${
                        current ? "bg-(--bg-hover) text-(--text)" : "text-(--muted) hover:bg-(--bg-hover) hover:text-(--text-soft)"
                      }`}
                      onClick={() => {
                        onSelectSettings(tab);
                        setMenuOpen(false);
                      }}
                    >
                      {t(`launcher.settings.tabs.${tab}`)}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <button
              className={`${itemBase} ${rowSize} text-[13.5px] font-medium ${
                settingsOpen ? "text-(--text)" : "text-(--muted) hover:bg-(--bg-card) hover:text-(--text-soft)"
              }`}
              aria-expanded={settingsOpen}
              onClick={() => onSelect("settings")}
            >
              <i className="fa-solid fa-sliders w-4.5 text-center text-[14px]" />
              {t("launcher.sidebar.settings")}
              <i
                className={`fa-solid fa-chevron-right ml-auto text-[10px] text-(--muted-2) transition-transform duration-200 ${
                  settingsOpen ? "rotate-90" : ""
                }`}
              />
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-250 ease-out ${
                settingsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="flex flex-col gap-px overflow-hidden" inert={!settingsOpen}>
                <div className="h-0.5" />
                {SETTINGS_TABS.map((tab) => {
                  const current = settingsOpen && settingsTab === tab;
                  return (
                    <button
                      key={tab}
                      className={`${itemBase} h-8 w-full pr-2.5 pl-10 text-[13px] ${itemState(current)}`}
                      aria-current={current ? "page" : undefined}
                      onClick={() => onSelectSettings(tab)}
                    >
                      {t(`launcher.settings.tabs.${tab}`)}
                    </button>
                  );
                })}
                <div className="h-1.5" />
              </div>
            </div>
          </>
        )}
      </nav>

      <div className="mt-auto flex flex-col">
        {collapsed ? (
          <div className="flex justify-center pb-2">
            <TooltipSimple content={t("launcher.sidebar.expand")} side="right" align="center" sideOffset={12}>
              <button className={`${iconButton} h-8 w-8`} onClick={onToggleWidth} aria-label={t("launcher.sidebar.expand")}>
                <i className="fa-solid fa-angles-right" />
              </button>
            </TooltipSimple>
          </div>
        ) : null}

        {statusGame ? (
          <div className={`flex items-center border-t border-(--border) pt-3.5 pb-4 ${collapsed ? "justify-center px-0" : "gap-3 px-4"}`}>
            {withTooltip(
              `${statusGame.name}: ${statusText}`,
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-(--border-strong) bg-(--bg-elevated)">
                <img src={toDisplaySrc(statusGame.icon)} alt="" className="h-6 w-6 object-contain" draggable={false} />
                {collapsed ? (
                  <span
                    className={`absolute right-0.5 bottom-0.5 h-2 w-2 rounded-full border border-(--bg-elevated) ${running ? "bg-(--success)" : "bg-(--muted-2)"}`}
                  />
                ) : null}
              </span>,
            )}
            {collapsed ? null : (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[13px] font-semibold text-(--text)">{statusGame.name}</span>
                <span className="flex items-center gap-1.5 text-[12px] text-(--muted)">
                  <span className={`h-1.75 w-1.75 shrink-0 rounded-full ${running ? "bg-(--success)" : "bg-(--muted-2)"}`} />
                  <span className="truncate">{statusText}</span>
                </span>
              </span>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
