// TASK-679 — the customer's and the guest's way to get order notifications in
// Telegram, in addition to the e-mail. One flow, two hosts: the account
// settings card and the guest checkout success panel.
export {
  useTelegramConnect,
  useDisconnectMyTelegram,
  useFocusWhenConnected,
  TELEGRAM_LINK_TTL_MS,
  TELEGRAM_POLL_MS,
  type TelegramConnectController,
  type TelegramConnectPhase,
  type TelegramConnectTarget,
  type TelegramLinkError,
} from "./model/use-telegram-connect";
export {
  TelegramConnect,
  TelegramConnectButton,
  TelegramConnectPanel,
  type TelegramConnectVariant,
} from "./ui/telegram-connect";
// The guest's order card — the checkout success panel and the guest order page
// (TASK-1999).
export { CheckoutTelegramCard } from "./ui/checkout-telegram-card";
