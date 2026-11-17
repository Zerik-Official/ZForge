/**
 * useNotificationStrings — sends the Windows notification texts to the
 * backend in the current language, on startup and whenever the language changes.
 */

import { useEffect } from "react";
import { t, useLocale } from "@/locales/i18n";
import { notificationsApi } from "@/services/api";
import type { NotificationStrings, NotificationText } from "@/types/domains/notifications";

const ROLES = ["TANK", "HEALER", "DAMAGER"];

function text(key: string): NotificationText {
  return { title: t(`notifications.${key}.title`), body: t(`notifications.${key}.body`) };
}

function buildStrings(): NotificationStrings {
  return {
    friendOnline: text("friendOnline"),
    friendOffline: text("friendOffline"),
    whisper: text("whisper"),
    invite: text("invite"),
    summon: text("summon"),
    proposal: text("proposal"),
    trade: text("trade"),
    tradeOpened: text("tradeOpened"),
    duel: text("duel"),
    battleground: text("battleground"),
    arena: text("arena"),
    roles: Object.fromEntries(ROLES.map((role) => [role, t(`notifications.roles.${role}`)])),
    accept: t("notifications.buttons.accept"),
    decline: t("notifications.buttons.decline"),
    enter: t("notifications.buttons.enter"),
    leaveQueue: t("notifications.buttons.leaveQueue"),
    reply: t("notifications.buttons.reply"),
    replyPlaceholder: t("notifications.replyPlaceholder"),
  };
}

export function useNotificationStrings(): void {
  const locale = useLocale();

  useEffect(() => {
    notificationsApi
      .setNotificationStrings(buildStrings())
      .catch((error: unknown) => console.error("Could not send notification texts", error));
  }, [locale]);
}
