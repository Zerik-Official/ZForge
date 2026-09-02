import { t, useLocale } from "@/locales/i18n";

export type View = "home" | "games" | "addons" | "settings";

interface SidebarProps {
  view: View;
  onSelect: (view: View) => void;
}

export function Sidebar({ view, onSelect }: SidebarProps) {
  useLocale();

  const NAV_ITEMS: { key: View; icon: string; label: string }[] = [
    { key: "home", icon: "fa-solid fa-house", label: t("launcher.sidebar.home") },
    { key: "games", icon: "fa-solid fa-gamepad", label: t("launcher.sidebar.games") },
    { key: "addons", icon: "fa-solid fa-puzzle-piece", label: t("launcher.sidebar.addons") },
  ];

  return (
    <aside className="flex h-full w-16 flex-col items-center gap-2 border-r border-(--border) bg-(--bg-elevated) py-4">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          className={`flex h-10 w-10 items-center justify-center rounded-xl text-[15px] transition-colors cursor-pointer ${
            view === item.key ? "bg-(--accent)/15 text-(--accent)" : "text-(--muted) hover:text-(--text)"
          }`}
          onClick={() => onSelect(item.key)}
          title={item.label}
        >
          <i className={item.icon} />
        </button>
      ))}
      <div className="mt-auto flex w-full flex-col items-center gap-2 border-t border-(--border) px-2 pt-3 pb-8">
        <button
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[15px] transition-colors cursor-pointer ${
            view === "settings" ? "bg-(--accent)/15 text-(--accent)" : "text-(--muted) hover:text-(--text)"
          }`}
          onClick={() => onSelect("settings")}
          title={t("launcher.sidebar.settings")}
        >
          <i className="fa-solid fa-gear" />
        </button>
      </div>
    </aside>
  );
}
