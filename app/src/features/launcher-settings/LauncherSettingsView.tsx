import { useState } from "react";
import { t, useLocale } from "@/locales/i18n";
import { AccountsTab } from "./tabs/AccountsTab";
import { GeneralTab } from "./tabs/GeneralTab";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { RichPresenceTab } from "./tabs/RichPresenceTab";

/**
 * Available tabs in the launcher settings view.
 */
export type LauncherSettingsTab = "general" | "richPresence" | "notifications" | "accounts";

/**
 * Properties for the {@link LauncherSettingsView} component.
 */
interface LauncherSettingsViewProps {
  /**
   * Tab selected on first render.
   * @default "general"
   */
  initialTab?: LauncherSettingsTab;
}

/**
 * Launcher settings view rendered inside the main shell.
 */
export function LauncherSettingsView({ initialTab = "general" }: LauncherSettingsViewProps) {
  useLocale();
  const [activeTab, setActiveTab] = useState<LauncherSettingsTab>(initialTab);

  return (
    <div className="flex h-full w-full overflow-hidden bg-(--bg)">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-(--border) bg-(--bg-soft) p-3">
        <button
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors cursor-pointer ${
            activeTab === "general"
              ? "bg-(--accent-dim) text-(--accent)"
              : "text-(--muted) hover:bg-(--bg-hover) hover:text-(--text-soft)"
          }`}
          onClick={() => setActiveTab("general")}
        >
          <i className="fa-solid fa-gear text-[13px]" />
          {t("launcher.settings.tabs.general")}
        </button>
        <button
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors cursor-pointer ${
            activeTab === "richPresence"
              ? "bg-(--accent-dim) text-(--accent)"
              : "text-(--muted) hover:bg-(--bg-hover) hover:text-(--text-soft)"
          }`}
          onClick={() => setActiveTab("richPresence")}
        >
          <i className="fa-brands fa-discord text-[13px]" />
          {t("launcher.settings.tabs.richPresence")}
        </button>
        <button
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors cursor-pointer ${
            activeTab === "notifications"
              ? "bg-(--accent-dim) text-(--accent)"
              : "text-(--muted) hover:bg-(--bg-hover) hover:text-(--text-soft)"
          }`}
          onClick={() => setActiveTab("notifications")}
        >
          <i className="fa-solid fa-bell text-[13px]" />
          {t("launcher.settings.tabs.notifications")}
        </button>
        <button
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors cursor-pointer ${
            activeTab === "accounts"
              ? "bg-(--accent-dim) text-(--accent)"
              : "text-(--muted) hover:bg-(--bg-hover) hover:text-(--text-soft)"
          }`}
          onClick={() => setActiveTab("accounts")}
        >
          <i className="fa-solid fa-user-shield text-[13px]" />
          {t("launcher.settings.tabs.accounts")}
        </button>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {activeTab === "general" ? <GeneralTab /> : null}
        {activeTab === "richPresence" ? <RichPresenceTab /> : null}
        {activeTab === "notifications" ? <NotificationsTab /> : null}
        {activeTab === "accounts" ? <AccountsTab /> : null}
      </section>
    </div>
  );
}