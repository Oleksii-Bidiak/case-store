import { Global, Module } from '@nestjs/common';
import { MailOutboxRepository } from './mail-outbox.repository';
import { MailOutboxService } from './mail-outbox.service';
import { MailOutboxWorker } from './mail-outbox.worker';
import { MAIL_OUTBOX_CLOCK, systemClock } from './mail-outbox.clock';

/**
 * MailOutboxModule — transactional-outbox infrastructure (TASK-103).
 *
 * Declared `@Global()` (like {@link MailModule}) so `MailOutboxService` is
 * injectable wherever an email needs enqueuing — today `OrderService` — without
 * each consumer re-importing it. Provides the cron {@link MailOutboxWorker}
 * (registered via `SchedulerRegistry` on init) and a production system clock
 * bound to {@link MAIL_OUTBOX_CLOCK}; tests override the clock for determinism.
 * Depends on the global `MailModule` (rendering/SMTP) and `PrismaModule`.
 */
@Global()
@Module({
  providers: [
    MailOutboxRepository,
    MailOutboxService,
    MailOutboxWorker,
    { provide: MAIL_OUTBOX_CLOCK, useValue: systemClock },
  ],
  exports: [MailOutboxRepository, MailOutboxService],
})
export class MailOutboxModule {}
