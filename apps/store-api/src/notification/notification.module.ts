import { Global, Module } from '@nestjs/common';
import { AdminNotificationController } from './admin-notification.controller';
import { CustomerNotificationController } from './customer-notification.controller';
import { NotificationBindingRepository } from './notification-binding.repository';
import { NotificationBindingService } from './notification-binding.service';
import { ShopNotifier } from './shop-notifier.service';
import { CustomerNotifier } from './customer-notifier.service';
import { TelegramClient } from './telegram/telegram.client';
import { TelegramChannelState } from './telegram/telegram-channel.state';
import { TelegramAdapter } from './telegram/telegram.adapter';
import { TelegramAdminService } from './telegram/telegram-admin.service';
import { CustomerTelegramService } from './telegram/customer-telegram.service';
import { TelegramRendererRegistry } from './telegram/telegram-renderers';
import { TelegramUpdatesWorker } from './telegram/telegram-updates.worker';

/**
 * NotificationModule — messenger channels of the notification outbox (plan 187,
 * TASK-674 onwards): the Telegram client and its channel state with the start-up
 * `getMe`, the TELEGRAM adapter, chat bindings with their one-time tokens and the
 * `getUpdates` poller that exchanges them (TASK-675), the admin endpoints, and
 * an account's own Telegram endpoints under `/users/me/notifications` (TASK-679).
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
 * It is `@Global()` for TASK-677's three shop events: {@link ShopNotifier} is
 * injected by `OrderService`, `ContactService` and `ReturnService`, each of which
 * would otherwise re-import this module. Same reasoning as `MailModule` and
 * `NotificationOutboxModule`. `ShopNotifier` injects the (also global)
 * `NotificationOutboxRepository` without an import cycle: global modules are
 * linked, not imported, and none of those three modules is imported back here.
 */
@Global()
@Module({
  controllers: [AdminNotificationController, CustomerNotificationController],
  providers: [
    NotificationBindingRepository,
    NotificationBindingService,
    ShopNotifier,
    CustomerNotifier,
    TelegramClient,
    TelegramChannelState,
    TelegramRendererRegistry,
    TelegramAdapter,
    TelegramAdminService,
    CustomerTelegramService,
    TelegramUpdatesWorker,
  ],
  exports: [
    NotificationBindingService,
    ShopNotifier,
    // TASK-680: OrderService queues the buyer's own Telegram messages through it.
    CustomerNotifier,
    TelegramClient,
    TelegramChannelState,
    TelegramRendererRegistry,
    TelegramAdapter,
    // TASK-679: the guest's routes live in OrderModule (they resolve the order by
    // its access token through OrderService) and act through this service.
    CustomerTelegramService,
  ],
})
export class NotificationModule {}
