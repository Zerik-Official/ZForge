import { call } from "../bridge";
import type { NotificationStrings } from "@/types/domains/notifications";

export class NotificationsApi {
  /** Send the notification texts in the current language. */
  setNotificationStrings(strings: NotificationStrings): Promise<void> {
    return call("set_notification_strings", { strings });
  }
}

export const notificationsApi = new NotificationsApi();
