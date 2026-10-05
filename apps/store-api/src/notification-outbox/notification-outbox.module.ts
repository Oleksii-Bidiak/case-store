import { Global, Module } from '@nestjs/common';
import { NotificationOutboxRepository } from './notification-outbox.repository';
import { NotificationOutboxService } from './notification-outbox.service';
import { NotificationOutboxWorker } from './notification-outbox.worker';
import { NOTIFICATION_OUTBOX_CLOCK, systemClock } from './notification-outbox.clock';
import { EmailAdapter } from './channels/email.adapter';
import {
  NOTIFICATION_CHANNEL_ADAPTERS,
  type NotificationChannelAdapter,
} from './channels/notification-channel-adapter';
import { NotificationModule } from '../notification/notification.module';
import { TelegramAdapter } from '../notification';

/**
 * NotificationOutboxModule — transactional-outbox infrastructure (TASK-103,
 * channels since TASK-673).
 *
 * Declared `@Global()` (like {@link MailModule}) so `NotificationOutboxService` is
 * injectable wherever a notification needs enqueuing — today `OrderService` and
 * the auth flows — without each consumer re-importing it. Provides the cron
 * {@link NotificationOutboxWorker} (registered via `SchedulerRegistry` on init)
 * and a production system clock bound to {@link NOTIFICATION_OUTBOX_CLOCK}; tests
 * override the clock for determinism. Depends on the global `MailModule`
 * (rendering/SMTP, wrapped by {@link EmailAdapter}) and `PrismaModule`.
 *
 * Channels: {@link NOTIFICATION_CHANNEL_ADAPTERS} is the list the dispatcher
 * routes `row.channel` through. To add a channel, make its adapter injectable
 * here and append it to the factory's `inject` and returned array. EMAIL's
 * adapter is provided by this module; TELEGRAM's (TASK-674) lives with the rest
 * of the Telegram code in {@link NotificationModule}, imported explicitly below
 * so the dependency is visible here even though that module is also global. The
 * arrow points one way only — NotificationModule imports nothing from here.
 */
@Global()
@Module({
  imports: [NotificationModule],
  providers: [
    NotificationOutboxRepository,
    NotificationOutboxService,
    NotificationOutboxWorker,
    EmailAdapter,
    {
      provide: NOTIFICATION_CHANNEL_ADAPTERS,
      useFactory: (
        email: EmailAdapter,
        telegram: TelegramAdapter,
      ): NotificationChannelAdapter[] => [email, telegram],
      inject: [EmailAdapter, TelegramAdapter],
    },
    { provide: NOTIFICATION_OUTBOX_CLOCK, useValue: systemClock },
  ],
  exports: [NotificationOutboxRepository, NotificationOutboxService],
})
export class NotificationOutboxModule {}
