import { Global, Module } from '@nestjs/common';
import { AdminNotificationController } from './admin-notification.controller';
import { NotificationBindingRepository } from './notification-binding.repository';
import { NotificationBindingService } from './notification-binding.service';
import { TelegramClient } from './telegram/telegram.client';
import { TelegramChannelState } from './telegram/telegram-channel.state';
import { TelegramAdapter } from './telegram/telegram.adapter';
import { TelegramAdminService } from './telegram/telegram-admin.service';
import { TelegramRendererRegistry } from './telegram/telegram-renderers';
import { TelegramUpdatesWorker } from './telegram/telegram-updates.worker';

/**
 * NotificationModule — messenger channels of the notification outbox (plan 187,
 * TASK-674 onwards): the Telegram client and its channel state with the start-up
 * `getMe`, the TELEGRAM adapter, chat bindings with their one-time tokens and the
 * `getUpdates` poller that exchanges them (TASK-675), and the admin endpoints.
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
 * It is `@Global()` for TASK-677's three shop events, which read the active SHOP
 * bindings from `OrderService`, the contact form and returns — each would
 * otherwise re-import this module. Same reasoning as `MailModule` and
 * `NotificationOutboxModule`. This module may inject the (also global)
 * `NotificationOutboxService` without an import cycle: global modules are
 * linked, not imported.
 */
@Global()
@Module({
  controllers: [AdminNotificationController],
  providers: [
    NotificationBindingRepository,
    NotificationBindingService,
    TelegramClient,
    TelegramChannelState,
    TelegramRendererRegistry,
    TelegramAdapter,
    TelegramAdminService,
    TelegramUpdatesWorker,
  ],
  exports: [
    NotificationBindingService,
    TelegramClient,
    TelegramChannelState,
    TelegramRendererRegistry,
    TelegramAdapter,
  ],
})
export class NotificationModule {}
