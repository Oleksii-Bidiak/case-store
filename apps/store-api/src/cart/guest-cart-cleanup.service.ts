import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PinoLogger } from 'nestjs-pino';
import { schedulingEnabled, stopCronJob } from '../common/scheduling';
import { CartRepository } from './cart.repository';
import { GUEST_CART_CLEANUP_CRON, GUEST_CART_EMPTY_RETENTION_MS } from './cart.constants';

/** Registered name of the cron job — used to look it up via SchedulerRegistry. */
const CLEANUP_JOB_NAME = 'guest-cart-cleanup';

/**
 * Daily sweep of empty guest carts (TASK-776).
 *
 * Until TASK-776 every `GET /cart` created a row, and the storefront header
 * reads the cart on every page — so each visitor and each crawler left an empty
 * cart behind forever. Reads no longer write, but a guest can still empty a
 * cart, and the rows already accumulated have to go. Only carts with no owner,
 * no lines and no activity within {@link GUEST_CART_EMPTY_RETENTION_MS} are
 * deleted.
 *
 * Registered through {@link SchedulerRegistry} in `onModuleInit`, like
 * `RefreshTokenCleanupService`, so it honours `SCHEDULER_ENABLED=false` (e2e,
 * secondary API containers) and is stopped on shutdown.
 */
@Injectable()
export class GuestCartCleanupService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GuestCartCleanupService.name);
  }

  onModuleInit(): void {
    if (!schedulingEnabled(this.configService)) return;
    const job = new CronJob(GUEST_CART_CLEANUP_CRON, () => {
      void this.purgeStaleEmptyGuestCarts();
    });

    this.schedulerRegistry.addCronJob(CLEANUP_JOB_NAME, job);
    job.start();

    this.logger.info(
      { event: 'cart.guestCleanup.scheduled', cron: GUEST_CART_CLEANUP_CRON },
      `Guest-cart cleanup scheduled (${GUEST_CART_CLEANUP_CRON})`,
    );
  }

  /** See {@link stopCronJob} — Nest does not close manually registered jobs. */
  onModuleDestroy(): void {
    stopCronJob(this.schedulerRegistry, CLEANUP_JOB_NAME);
  }

  /**
   * Delete empty guest carts older than the retention window and log the count.
   * Public so it can be tested directly without waiting for the scheduler.
   */
  async purgeStaleEmptyGuestCarts(): Promise<number> {
    const cutoff = new Date(Date.now() - GUEST_CART_EMPTY_RETENTION_MS);
    const deletedCount = await this.cartRepository.deleteStaleEmptyGuestCarts(cutoff);

    this.logger.info(
      { event: 'cart.guestCleanup', deletedCount, cutoff: cutoff.toISOString() },
      `Purged ${deletedCount} empty guest cart(s)`,
    );

    return deletedCount;
  }
}
