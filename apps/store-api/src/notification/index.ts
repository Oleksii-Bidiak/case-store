// Notification Module — public API (plan 187)
export { NotificationModule } from './notification.module';
export { adminUrl } from './notification-links';
export { ShopNotifier } from './shop-notifier.service';
export {
  SHOP_NEW_ORDER_TYPE,
  SHOP_CONTACT_MESSAGE_TYPE,
  SHOP_RETURN_REQUESTED_TYPE,
  type ShopNotificationType,
  type ShopNewOrderPayload,
  type ShopContactMessageInput,
  type ShopContactMessagePayload,
  type ShopReturnRequestedInput,
  type ShopReturnRequestedPayload,
} from './shop-notification.types';
export {
  NotificationBindingService,
  BINDING_TOKEN_TTL_MS,
  type IssueTokenParams,
  type IssuedToken,
} from './notification-binding.service';
export type {
  NotificationBindingEntity,
  ConsumeTokenResult,
} from './entities/notification-binding.entity';
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
  CustomerTelegramService,
  type CustomerTelegramOwner,
  type CustomerTelegramStatus,
  type CustomerTelegramLink,
} from './telegram/customer-telegram.service';
export {
  CustomerTelegramStatusDto,
  CustomerTelegramStatusResponse,
  CustomerTelegramLinkDto,
  CustomerTelegramLinkResponse,
} from './dto/customer-telegram.dto';
export {
  TelegramRendererRegistry,
  DEFAULT_TELEGRAM_RENDERERS,
  type TelegramRenderer,
  type TelegramRenderContext,
} from './telegram/telegram-renderers';
export { escapeHtml } from './telegram/telegram-html';
