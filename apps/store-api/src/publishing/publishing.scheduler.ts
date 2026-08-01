import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PinoLogger } from 'nestjs-pino';
import { schedulingEnabled, stopCronJob } from '../common/scheduling/scheduling.util';
import { PUBLISHABLE_REPOSITORY, PublishablePort } from './publishing.tokens';
import { RevalidationNotifier } from './revalidation.notifier';

/** Registered name of the cron job — used to look it up via SchedulerRegistry. */
const PUBLISH_JOB_NAME = 'publishing-publish-due';

/** Default schedule: every minute. */
const DEFAULT_CRON = '* * * * *';

/**
 * PublishingScheduler — cron-driven publisher for scheduled content (TASK-187).
 *
 * Mirrors {@link MailOutboxWorker}: the job is registered in `onModuleInit` via
 * {@link SchedulerRegistry} (not the `@Cron` decorator) so the schedule is read
 * from config at runtime — `PUBLISHING_CRON`, default `* * * * *`.
 *
 * Publishers are collected app-wide via {@link DiscoveryService}: any provider
 * registered under {@link PUBLISHABLE_REPOSITORY} (a `useExisting` alias in a
 * content module) is picked up automatically, so a NEW content module (blog,
 * banners) plugs in by providing that token alone — no edit to this module. Each
 * tick flips every
 * port's due `SCHEDULED` rows to `PUBLISHED` and, when a port flipped ≥1 row,
 * asks the storefront to revalidate that port's cache target. Per-port errors
 * are caught and logged so one bad port never crashes the tick.
 */
@Injectable()
export class PublishingScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly cronExpression: string;

  constructor(
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly discovery: DiscoveryService,
    private readonly logger: PinoLogger,
    private readonly revalidation: RevalidationNotifier,
  ) {
    this.logger.setContext(PublishingScheduler.name);
    this.cronExpression = this.config.get<string>('PUBLISHING_CRON', DEFAULT_CRON);
  }

  onModuleInit(): void {
    if (!schedulingEnabled(this.config)) return;
    const job = new CronJob(this.cronExpression, () => {
      void this.tick();
    });

    this.schedulerRegistry.addCronJob(PUBLISH_JOB_NAME, job);
    job.start();

    this.logger.info(
      {
        event: 'publishing.scheduled',
        cron: this.cronExpression,
        publishers: this.collectPublishers().length,
      },
      `Publishing scheduler started (${this.cronExpression})`,
    );
  }

  /** See {@link stopCronJob} — Nest does not close manually registered jobs. */
  onModuleDestroy(): void {
    stopCronJob(this.schedulerRegistry, PUBLISH_JOB_NAME);
  }

  /**
   * Run one publish pass across every registered publisher. Public so it can be
   * unit-tested directly without waiting for the scheduler to fire. A failure in
   * one publisher is caught and logged so the others still run.
   */
  async tick(): Promise<void> {
    const now = new Date();

    for (const publisher of this.collectPublishers()) {
      try {
        const count = await publisher.publishDue(now);
        if (count > 0 && publisher.revalidateTarget) {
          await this.revalidation.revalidate(publisher.revalidateTarget);
        }
      } catch (err) {
        this.logger.error(
          { event: 'publishing.publishDue.error', err },
          'Publishing tick failed for a publisher',
        );
      }
    }
  }

  /**
   * Gather every provider registered under {@link PUBLISHABLE_REPOSITORY}
   * (a `multi` token) via the Nest DI container. Cheap enough to run per tick;
   * keeps the set current as content modules come and go.
   */
  private collectPublishers(): PublishablePort[] {
    return this.discovery
      .getProviders()
      .filter((wrapper) => wrapper.token === PUBLISHABLE_REPOSITORY && !!wrapper.instance)
      .map((wrapper) => wrapper.instance as PublishablePort);
  }
}
