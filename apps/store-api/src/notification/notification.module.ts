import { Global, Module } from '@nestjs/common';
import { AdminNotificationController } from './admin-notification.controller';
import { TelegramClient } from './telegram/telegram.client';
import { TelegramChannelState } from './telegram/telegram-channel.state';
import { TelegramAdapter } from './telegram/telegram.adapter';
import { TelegramRendererRegistry } from './telegram/telegram-renderers';

/**
 * NotificationModule — messenger channels of the notification outbox (plan 187,
 * TASK-674 onwards). Today: the Telegram client, the channel state with its
 * start-up `getMe`, the TELEGRAM adapter and the admin status endpoint.
 *
 * ## Wiring (why `@Global()`, and who imports whom)
 *
 * The outbox owns the adapter list: {@link NotificationOutboxModule}'s
 * `NOTIFICATION_CHANNEL_ADAPTERS` factory injects {@link TelegramAdapter} next to
 * `EmailAdapter`, and that module imports this one explicitly. The arrow points
 * ONE way — outbox → notification — because the adapter needs nothing from the
 * outbox but the `NotificationChannelAdapter` interface and
 * `PermanentDeliveryError`, which are plain imports, not providers.
 *
 * It is `@Global()` for what comes next, not for the outbox: TASK-675 adds the
 * binding service here, and TASK-677's three shop events enqueue pings from
 * `OrderService`, the contact form and returns — each would otherwise re-import
 * this module. Same reasoning as `MailModule` and `NotificationOutboxModule`.
 * TASK-675 may inject the (also global) `NotificationOutboxService` here without
 * creating an import cycle: global modules are linked, not imported.
 */
@Global()
@Module({
  controllers: [AdminNotificationController],
  providers: [TelegramClient, TelegramChannelState, TelegramRendererRegistry, TelegramAdapter],
  exports: [TelegramClient, TelegramChannelState, TelegramRendererRegistry, TelegramAdapter],
})
export class NotificationModule {}
