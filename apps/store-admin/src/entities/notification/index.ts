// Notification entity — the shop's Telegram channel on /settings/notifications
// (TASK-676, plan 187 U): the bot's state, the connected shop chats, the
// one-time connect link, the test message and disconnecting a chat.
//
// The `notifications` Orval tag is not re-exported by the `@/shared/api`
// barrel, so this slice names exactly what the panel uses, straight from the
// generated module — the rest of the app depends on `@/entities/notification`,
// never on `shared/api/generated` directly. Every route here is guarded by
// `settings:notifications` (`PERM.settingsNotifications`).

export {
  useGetTelegramNotificationChannel,
  getGetTelegramNotificationChannelQueryKey,
  useCreateTelegramConnectLink,
  useSendTelegramTestMessage,
  useRevokeTelegramBinding,
} from "@/shared/api/generated/notifications/notifications";

export { TelegramChannelStateValue, TelegramChatKind } from "@/shared/api";

export type {
  NotificationBindingUserDto,
  TelegramChannelStatusDto,
  TelegramChannelStatusResponse,
  TelegramConnectLinkDto,
  TelegramShopBindingDto,
  TelegramTestResultDto,
} from "@/shared/api";
