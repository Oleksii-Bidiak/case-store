import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CatalogImportService } from './catalog-import.service';

/** Registered name of the cron job — used to look it up via SchedulerRegistry. */
export const CATALOG_IMPORT_CRON = 'catalog-import-apply';

/** Every 10 seconds: fast enough that a 1300-row run finishes in minutes. */
const DEFAULT_SCHEDULE = '*/10 * * * * *';

/**
 * Drains confirmed catalogue imports, one chunk per tick (TASK-360).
 *
 * Registered through {@link SchedulerRegistry} in `onModuleInit` rather than with
 * the `@Cron` decorator, so the schedule is read from config at boot — the same
 * shape `MailOutboxWorker` and `PaymentReconcileWorker` already use.
 *
 * Chunking is the point. Applying 1300 rows takes minutes: doing it inside the
 * confirm request would hold an HTTP connection open for the whole run and lose
 * everything if the operator's browser gave up. Instead the endpoint only marks
 * the run APPLYING, and progress is a column the admin screen polls.
 *
 * The worker is stateless — it re-reads the run row every tick — so a restarted
 * API resumes a half-applied import exactly where it stopped.
 */
@Injectable()
export class CatalogImportWorker implements OnModuleInit {
  private readonly logger = new Logger(CatalogImportWorker.name);
  /** Guards against a slow chunk overlapping the next tick. */
  private running = false;

  constructor(
    private readonly service: CatalogImportService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const schedule = this.config.get<string>('CATALOG_IMPORT_CRON') ?? DEFAULT_SCHEDULE;
    const job = new CronJob(schedule, () => {
      void this.tick();
    });
    this.schedulerRegistry.addCronJob(CATALOG_IMPORT_CRON, job);
    job.start();
  }

  /** Apply one chunk of the oldest confirmed run, if there is one. */
  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const run = await this.service.findNextApplying();
      if (!run) {
        return;
      }
      await this.service.applyChunk(run);
    } catch (error) {
      // A failure here is about the RUN, not the tick: record it against the run
      // so the operator sees why their import stopped, instead of it silently
      // sitting at APPLYING forever.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Catalogue import tick failed: ${message}`);
      const run = await this.service.findNextApplying().catch(() => null);
      if (run) {
        await this.service.failRun(run.id, message).catch(() => undefined);
      }
    } finally {
      this.running = false;
    }
  }
}
