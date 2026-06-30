import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PinoLogger } from 'nestjs-pino';
import { MailOutboxService } from './mail-outbox.service';

/** Registered name of the cron job — used to look it up via SchedulerRegistry. */
const DISPATCH_JOB_NAME = 'mail-outbox-dispatch';

/** Default schedule: every minute. */
const DEFAULT_CRON = '* * * * *';

/**
 * MailOutboxWorker — cron-driven dispatcher for the transactional outbox
 * (TASK-103). Mirrors {@link RefreshTokenCleanupService}: the job is registered
 * in `onModuleInit` via {@link SchedulerRegistry} (not the `@Cron` decorator) so
 * the schedule is read from config at runtime — `MAIL_OUTBOX_CRON`, default
 * `* * * * *`. Each tick delegates to {@link MailOutboxService.dispatchDue};
 * tick errors are caught and logged so a transient failure never crashes the
 * scheduler.
 */
@Injectable()
export class MailOutboxWorker implements OnModuleInit {
  private readonly cronExpression: string;

  constructor(
    private readonly outboxService: MailOutboxService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MailOutboxWorker.name);
    this.cronExpression = this.config.get<string>('MAIL_OUTBOX_CRON', DEFAULT_CRON);
  }

  onModuleInit(): void {
    const job = new CronJob(this.cronExpression, () => {
      void this.tick();
    });

    this.schedulerRegistry.addCronJob(DISPATCH_JOB_NAME, job);
    job.start();

    this.logger.info(
      { event: 'mailOutbox.scheduled', cron: this.cronExpression },
      `Mail outbox worker scheduled (${this.cronExpression})`,
    );
  }

  /**
   * Run one dispatch pass. Public so it can be unit-tested directly without
   * waiting for the scheduler to fire. Swallows (and logs) any error so a bad
   * tick never propagates into the cron runner.
   */
  async tick(): Promise<void> {
    try {
      await this.outboxService.dispatchDue();
    } catch (err) {
      this.logger.error(
        { event: 'mailOutbox.dispatch.error', err },
        'Mail outbox dispatch tick failed',
      );
    }
  }
}
