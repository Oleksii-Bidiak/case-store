// Notification Module — public API (plan 187)
export { NotificationModule } from './notification.module';
export { adminUrl } from './notification-links';
export {
  TelegramClient,
  TelegramApiError,
  TELEGRAM_API_URL,
  type TelegramBotUser,
  type TelegramMessage,
  type TelegramUpdate,
  type SendMessageOptions,
  type GetUpdatesOptions,
} from './telegram/telegram.client';
export {
  TelegramChannelState,
  TELEGRAM_RECHECK_AFTER_MS,
  type TelegramChannelSnapshot,
} from './telegram/telegram-channel.state';
export { TelegramAdapter } from './telegram/telegram.adapter';
export {
  TelegramRendererRegistry,
  DEFAULT_TELEGRAM_RENDERERS,
  type TelegramRenderer,
} from './telegram/telegram-renderers';
export { escapeHtml } from './telegram/telegram-html';
