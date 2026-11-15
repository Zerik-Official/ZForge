export interface NotificationSettings {
  enabled: boolean;
  only_when_unfocused: boolean;
  friends: boolean;
  whispers: boolean;
  group_invites: boolean;
  summons: boolean;
  dungeon_finder: boolean;
  trades: boolean;
  duels: boolean;
  battlegrounds: boolean;
}

export type NotificationKind = Exclude<keyof NotificationSettings, "enabled" | "only_when_unfocused">;

export interface NotificationText {
  title: string;
  body: string;
}

export interface NotificationStrings {
  friendOnline: NotificationText;
  friendOffline: NotificationText;
  whisper: NotificationText;
  invite: NotificationText;
  summon: NotificationText;
  proposal: NotificationText;
  trade: NotificationText;
  tradeOpened: NotificationText;
  duel: NotificationText;
  battleground: NotificationText;
  arena: NotificationText;
  roles: Record<string, string>;
  accept: string;
  decline: string;
  enter: string;
  leaveQueue: string;
}
