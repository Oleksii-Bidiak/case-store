import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PinoLogger } from 'nestjs-pino';
import { AuthRepository } from './auth.repository';

/** Registered name of the cron job — used to look it up via SchedulerRegistry. */
const CLEANUP_JOB_NAME = 'refresh-token-cleanup';

/** Default schedule: daily at 03:00 (server time) — off-peak. */
const DEFAULT_CRON = '0 3 * * *';

/**
 * Periodically purges stale `RefreshToken` rows (expired or revoked) to bound
 * table growth and shrink the stored-token attack surface (TASK-102).
 *
 * The schedule and a revoked-token retention window are env-configurable
 * (`REFRESH_TOKEN_CLEANUP_CRON`, `REFRESH_TOKEN_REVOKED_RETENTION_DAYS`). The
 * job is registered in `onModuleInit` via {@link SchedulerRegistry} — rather
 * than the `@Cron` decorator — so the cron expression is read from config at
 * runtime (decorator metadata is evaluated before `.env` is loaded).
 */
@Injectable()
export class RefreshTokenCleanupService implements OnModuleInit {
  private readonly retentionDays: number;
  private readonly cronExpression: string;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RefreshTokenCleanupService.name);
    this.retentionDays = this.configService.get<number>('REFRESH_TOKEN_REVOKED_RETENTION_DAYS', 0);
    this.cronExpression = this.configService.get<string>(
      'REFRESH_TOKEN_CLEANUP_CRON',
      DEFAULT_CRON,
    );
  }

  onModuleInit(): void {
    const job = new CronJob(this.cronExpression, () => {
      void this.purgeStaleTokens();
    });

    this.schedulerRegistry.addCronJob(CLEANUP_JOB_NAME, job);
    job.start();

    this.logger.info(
      {
        event: 'refreshToken.cleanup.scheduled',
        cron: this.cronExpression,
        retentionDays: this.retentionDays,
      },
      `Refresh-token cleanup scheduled (${this.cronExpression})`,
    );
  }

  /**
   * Delete expired/revoked refresh tokens and log the purged count. Public so it
   * can be unit-tested directly without relying on the scheduler to fire.
   */
  async purgeStaleTokens(): Promise<number> {
    const deletedCount = await this.authRepository.deleteExpiredAndRevoked(
      new Date(),
      this.retentionDays,
    );

    this.logger.info(
      { event: 'refreshToken.cleanup', deletedCount, retentionDays: this.retentionDays },
      `Purged ${deletedCount} stale refresh-token row(s)`,
    );

    return deletedCount;
  }
}
