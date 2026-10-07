// Notification entity — re-exports the generated customer Telegram types and
// hooks (TASK-679, FSD entities layer). Upper layers import notification data
// access from here, not from the generated client directly.
//
// Two owners, one status shape:
//   - the signed-in customer — `/users/me/notifications/telegram`, the account
//     comes from the session;
//   - a guest — `/orders/guest/{token}/notifications/telegram`, where the token
//     is the order access token (the confirmation e-mail's link, and the
//     `guestAccessToken` the create call returns once).
export type {
  CustomerTelegramStatusDto,
  CustomerTelegramStatusResponse,
  CustomerTelegramLinkDto,
  CustomerTelegramLinkResponse,
} from "@/shared/api/generated/models";

export {
  useGetMyTelegramNotifications,
  getGetMyTelegramNotificationsQueryKey,
  useCreateMyTelegramLink,
  useRevokeMyTelegramNotifications,
  useGetGuestOrderTelegramNotifications,
  getGetGuestOrderTelegramNotificationsQueryKey,
  useCreateGuestOrderTelegramLink,
} from "@/shared/api/generated/notifications/notifications";
