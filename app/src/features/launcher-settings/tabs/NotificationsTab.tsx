import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { t, useLocale } from "@/locales/i18n";
import { api, errorCode } from "@/services/api";
import type { NotificationKind, NotificationSettings } from "@/types/domains/notifications";
import type { SdkStatus } from "@/types/domains/sdk";

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

const REQUIRED_SDK = [2, 1];

function supportsNotifications(version: string | null | undefined): boolean {
  if (!version) return false;
  const [major = 0, minor = 0] = version.replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  return major > REQUIRED_SDK[0] || (major === REQUIRED_SDK[0] && minor >= REQUIRED_SDK[1]);
}

/**
 * Windows notifications settings tab.
 */
export function NotificationsTab() {
  useLocale();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [sdk, setSdk] = useState<SdkStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [config, status] = await Promise.all([api.getAppConfig(), api.getSdkStatus()]);
        if (cancelled) return;
        setSettings(config.notifications);
        setSdk(status);
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
    return (
      <div className="flex flex-1 items-center justify-center text-(--muted)">
        {error ? <span className="text-[12px] text-(--danger)">{error}</span> : <i className="fa-solid fa-spinner fa-spin text-[18px]" />}
      </div>
    );
  }

  const sdkReady = sdk?.valid === true && supportsNotifications(sdk.version);

  return (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-[13px] font-semibold text-(--text)">{t("launcher.settings.notifications.title")}</h2>
        <p className="max-w-xl text-[11px] leading-relaxed text-(--muted)">{t("launcher.settings.notifications.description")}</p>
      </div>

      {!sdkReady ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <i className="fa-solid fa-circle-info mt-0.5 text-[13px] text-amber-500" />
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-amber-500">{t("launcher.settings.notifications.sdkRequired.title")}</span>
            <span className="text-[11px] leading-relaxed text-(--muted)">
              {t("launcher.settings.notifications.sdkRequired.description", { version: REQUIRED_SDK.join(".") })}
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-(--border-strong) bg-(--bg-card) p-5">
        <Checkbox
          checked={settings.enabled}
          onChange={(enabled) => void update({ enabled })}
          label={t("launcher.settings.notifications.enable")}
          description={t("launcher.settings.notifications.enableDescription")}
        />
        <Checkbox
          checked={settings.only_when_unfocused}
          onChange={(only_when_unfocused) => void update({ only_when_unfocused })}
          label={t("launcher.settings.notifications.onlyWhenUnfocused")}
          description={t("launcher.settings.notifications.onlyWhenUnfocusedDescription")}
          disabled={!settings.enabled}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-(--border-strong) bg-(--bg-card) p-5">
        <h3 className="text-[12px] font-semibold text-(--text-soft)">{t("launcher.settings.notifications.kindsTitle")}</h3>
        {KINDS.map(({ kind, icon }) => (
          <div key={kind} className="flex items-start gap-3">
            <i className={`fa-solid ${icon} mt-1 w-4 text-center text-[12px] text-(--muted)`} />
            <Checkbox
              checked={settings[kind]}
              onChange={(value) => void update({ [kind]: value })}
              label={t(`launcher.settings.notifications.kinds.${kind}.label`)}
              description={t(`launcher.settings.notifications.kinds.${kind}.description`)}
              disabled={!settings.enabled}
            />
          </div>
        ))}
      </div>

      {error ? <span className="text-[12px] text-(--danger)">{error}</span> : null}
    </div>
  );
}
