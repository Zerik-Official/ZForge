import { useEffect, useState } from "react";
import { PageState } from "@/components/layout/PageState";
import { SettingsGroup, SettingsPage } from "@/components/layout/SettingsPage";
import { SdkRequirement } from "@/components/sdk/SdkRequirement";
import { Checkbox } from "@/components/ui/Checkbox";
import { featureStatus, useCapabilities } from "@/hooks/useCapabilities";
import { t, useLocale } from "@/locales/i18n";
import { api, errorCode } from "@/services/api";
import type { NotificationKind, NotificationSettings } from "@/types/domains/notifications";

const KINDS: { kind: NotificationKind; icon: string }[] = [
  { kind: "friends", icon: "fa-user-group" },
  { kind: "whispers", icon: "fa-comment-dots" },
  { kind: "group_invites", icon: "fa-people-group" },
  { kind: "summons", icon: "fa-wand-sparkles" },
  { kind: "dungeon_finder", icon: "fa-dungeon" },
  { kind: "trades", icon: "fa-right-left" },
  { kind: "duels", icon: "fa-khanda" },
  { kind: "battlegrounds", icon: "fa-flag" },
];

/**
 * Windows notifications settings tab.
 */
export function NotificationsTab() {
  useLocale();
  const capabilities = useCapabilities();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await api.getAppConfig();
        if (cancelled) return;
        setSettings(config.notifications);
      } catch (e) {
        if (!cancelled) setError(t(`common.errors.codes.${errorCode(e)}`));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function update(patch: Partial<NotificationSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      const saved = await api.saveAppConfig({ notifications: next });
      setSettings(saved.notifications);
      setError(null);
    } catch (e) {
      setSettings(settings);
      setError(t(`common.errors.codes.${errorCode(e)}`));
    }
  }

  if (!settings) {
    return <PageState error={error} />;
  }

  const whisperReply = featureStatus(capabilities, "whisper_reply");

  return (
    <SettingsPage title={t("launcher.settings.notifications.title")} description={t("launcher.settings.notifications.description")}>
      <SdkRequirement status={featureStatus(capabilities, "notifications")} />

      <SettingsGroup>
        <Checkbox
          layout="row"
          checked={settings.enabled}
          onChange={(enabled) => void update({ enabled })}
          label={t("launcher.settings.notifications.enable")}
          description={t("launcher.settings.notifications.enableDescription")}
        />
        <Checkbox
          layout="row"
          checked={settings.only_when_unfocused}
          onChange={(only_when_unfocused) => void update({ only_when_unfocused })}
          label={t("launcher.settings.notifications.onlyWhenUnfocused")}
          description={t("launcher.settings.notifications.onlyWhenUnfocusedDescription")}
          disabled={!settings.enabled}
        />
      </SettingsGroup>

      <SettingsGroup title={t("launcher.settings.notifications.kindsTitle")}>
        {KINDS.map(({ kind, icon }) => (
          <Checkbox
            key={kind}
            layout="row"
            icon={`fa-solid ${icon}`}
            checked={settings[kind]}
            onChange={(value) => void update({ [kind]: value })}
            label={t(`launcher.settings.notifications.kinds.${kind}.label`)}
            description={t(`launcher.settings.notifications.kinds.${kind}.description`)}
            disabled={!settings.enabled}
            trailing={
              kind === "whispers" && whisperReply?.available === false ? (
                <SdkRequirement status={whisperReply} variant="badge" />
              ) : null
            }
          />
        ))}
      </SettingsGroup>

      {error ? <span className="text-[12.5px] text-(--danger)">{error}</span> : null}
    </SettingsPage>
  );
}
