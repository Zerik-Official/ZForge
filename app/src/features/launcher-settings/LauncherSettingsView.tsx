import { useLocale } from "@/locales/i18n";
import { AccountsTab } from "./tabs/AccountsTab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { GeneralTab } from "./tabs/GeneralTab";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { RichPresenceTab } from "./tabs/RichPresenceTab";
import { SdkTab } from "./tabs/SdkTab";

/**
 * Available sections of the launcher settings, chosen from the sidebar.
 */
export type LauncherSettingsTab = "general" | "appearance" | "sdk" | "richPresence" | "notifications" | "accounts";

/**
 * Properties for the {@link LauncherSettingsView} component.
 */
interface LauncherSettingsViewProps {
  /** Section to show. */
  tab: LauncherSettingsTab;
}

/**
 * Launcher settings view rendered inside the main shell. The sidebar picks the section.
 */
export function LauncherSettingsView({ tab }: LauncherSettingsViewProps) {
  useLocale();

  return (
    <section key={tab} className="h-full w-full overflow-y-auto bg-(--bg)">
      {tab === "general" ? <GeneralTab /> : null}
      {tab === "appearance" ? <AppearanceTab /> : null}
      {tab === "sdk" ? <SdkTab /> : null}
      {tab === "richPresence" ? <RichPresenceTab /> : null}
      {tab === "notifications" ? <NotificationsTab /> : null}
      {tab === "accounts" ? <AccountsTab /> : null}
    </section>
  );
}
