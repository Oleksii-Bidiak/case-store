import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { OrderStatus } from '@prisma/client';
import { CronJob } from 'cron';
import { PinoLogger } from 'nestjs-pino';
import { schedulingEnabled, stopCronJob } from '../common/scheduling/scheduling.util';
import { OrderService } from '../order';
import { PAYMENT_CLOCK, type Clock } from './payment.clock';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment.port';
import { PaymentRepository } from './payment.repository';
import { PaymentService } from './payment.service';
import { PaymentOutcome } from './payment.types';

/** Registered name of the cron job — used to look it up via SchedulerRegistry. */
const RECONCILE_JOB_NAME = 'payment-reconcile';

/** Default schedule: every minute. */
const DEFAULT_CRON = '* * * * *';

/**
 * How long an attempt must have been PENDING before we poll the provider.
 *
 * A constant rather than a setting: it is not a business decision, it is "long
 * enough that the customer has plausibly finished typing a 3DS code". Polling
 * sooner just spends API calls to be told `wait_secure`.
 */
const POLL_GRACE_MINUTES = 2;

/** Cap per tick, so one bad hour cannot turn a minute's cron into an hour's work. */
const BATCH_SIZE = 50;

/**
 * PaymentReconcileWorker — the safety net that makes online payment trustworthy.
 *
 * **This is not follow-up work.** LiqPay does not document whether or how often
 * it retries a callback, so a callback lost to a deploy, a network blip or a
 * 500 would otherwise mean a customer who paid and an order that stays unpaid
 * forever, with nothing in the system to notice (docs/payments-liqpay.md §3.8).
 *
 * Each tick does two things, in this order:
 *
 *  1. **Poll** every attempt still PENDING past a grace period and apply
 *     whatever the provider says. This runs FIRST on purpose — a payment that
 *     actually succeeded gets applied (clearing the order's reservation
 *     deadline) before step 2 could consider cancelling it. That ordering is the
 *     protection against "order cancelled although the customer paid".
 *  2. **Expire** reservations whose deadline has passed with no payment:
 *     the attempts become EXPIRED and the order is cancelled through
 *     `OrderService`, which returns the reserved stock. Cash-on-delivery orders
 *     never have a deadline and so are never touched.
 *
 * Registered via {@link SchedulerRegistry} rather than `@Cron` so the schedule
 * comes from `PAYMENT_RECONCILE_CRON` at runtime, and takes an injectable
 * {@link Clock} so its time arithmetic is deterministic under test — both
 * mirroring {@link MailOutboxWorker}.
 */
@Injectable()
export class PaymentReconcileWorker implements OnModuleInit, OnModuleDestroy {
  private readonly cronExpression: string;
  private readonly autoCancelEnabled: boolean;

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly paymentService: PaymentService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly orderService: OrderService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(PAYMENT_CLOCK) private readonly clock: Clock,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PaymentReconcileWorker.name);
    this.cronExpression = this.config.get<string>('PAYMENT_RECONCILE_CRON', DEFAULT_CRON);
    // Defaults ON: an unpaid order holding stock indefinitely is the worse
    // failure. Only the exact string 'false' disables it, so a typo does not
    // silently switch off stock recovery.
    this.autoCancelEnabled = this.config.get<string>('ORDER_AUTOCANCEL_UNPAID', 'true') !== 'false';
  }

  onModuleInit(): void {
    if (!schedulingEnabled(this.config)) return;
    const job = new CronJob(this.cronExpression, () => {
      void this.tick();
    });

    this.schedulerRegistry.addCronJob(RECONCILE_JOB_NAME, job);
    job.start();

    this.logger.info(
      {
        event: 'payment.reconcile.scheduled',
        cron: this.cronExpression,
        autoCancelUnpaid: this.autoCancelEnabled,
      },
      `Payment reconcile worker scheduled (${this.cronExpression})`,
    );
  }

  /** See {@link stopCronJob} — Nest does not close manually registered jobs. */
  onModuleDestroy(): void {
    stopCronJob(this.schedulerRegistry, RECONCILE_JOB_NAME);
  }

  /**
   * Run one reconciliation pass. Public so it can be unit-tested directly
   * without waiting for the scheduler. Swallows (and logs) any error so a bad
   * tick never propagates into the cron runner.
   */
  async tick(): Promise<void> {
    try {
      await this.pollPendingAttempts();
      await this.expireStaleReservations();
    } catch (err) {
      this.logger.error({ event: 'payment.reconcile.error', err }, 'Payment reconcile tick failed');
    }
  }

  /**
   * Ask the provider about attempts that have been PENDING too long, and apply
   * anything final. A poll that returns nothing, or reports work still in
   * progress, leaves the attempt PENDING for the next tick — the one thing that
   * must never happen is treating "I could not find out" as "it failed".
   */
  private async pollPendingAttempts(): Promise<number> {
    if (!this.provider.isConfigured()) {
      return 0;
    }

    const cutoff = new Date(this.clock.now().getTime() - POLL_GRACE_MINUTES * 60_000);
    const pending = await this.paymentRepository.findPendingOlderThan(cutoff, BATCH_SIZE);
    let applied = 0;

    for (const payment of pending) {
      try {
        const event = await this.provider.fetchStatus(payment.id);

        // No answer, or "still working on it" — poll again next tick. Not
        // recorded as an event: a poll every minute would otherwise fill the
        // audit log with statuses the customer never saw.
        if (!event || event.outcome === PaymentOutcome.IGNORED) {
          continue;
        }

        const result = await this.paymentService.applyEvent(event);
        if (result.applied) {
          applied += 1;
          this.logger.warn(
            {
              event: 'payment.reconcile.recovered',
              paymentId: payment.id,
              orderId: payment.orderId,
              outcome: event.outcome,
            },
            'Reconcile applied a provider event the callback never delivered',
          );
        }
      } catch (err) {
        // One bad payment must not stop the batch — the rest of the queue is
        // very likely fine, and this one is retried next tick.
        this.logger.error(
          { event: 'payment.reconcile.attempt_failed', paymentId: payment.id, err },
          'Could not reconcile a payment attempt',
        );
      }
    }

    return applied;
  }

  /**
   * Cancel orders whose stock reservation expired unpaid and release the stock.
   *
   * The cancellation goes through {@link OrderService.updateStatus} — never a
   * direct write — so the status history, the stock restock and the state
   * machine all stay consistent (docs §4 rule 2). `changedBy: null` marks it as
   * a system action, which the schema already provides for.
   */
  private async expireStaleReservations(): Promise<number> {
    if (!this.autoCancelEnabled) {
      return 0;
    }

    const now = this.clock.now();
    const due = await this.paymentRepository.findExpiredReservations(now, BATCH_SIZE);
    let cancelled = 0;

    for (const order of due) {
      try {
        // Attempts first, then the order. This order is self-healing: marking
        // attempts EXPIRED is idempotent, so if the cancel below fails the next
        // tick finds the same order (still unpaid and pre-shipment) and retries.
        await this.paymentRepository.markExpiredByOrderId(order.id);
        await this.orderService.updateStatus(order.id, OrderStatus.CANCELLED, null);

        cancelled += 1;
        this.logger.info(
          {
            event: 'payment.reconcile.reservation_expired',
            orderId: order.id,
            reservationExpiresAt: order.reservationExpiresAt,
          },
          'Unpaid order cancelled after its reservation deadline; stock returned',
        );
      } catch (err) {
        this.logger.error(
          { event: 'payment.reconcile.expire_failed', orderId: order.id, err },
          'Could not cancel an order whose reservation expired',
        );
      }
    }

    return cancelled;
  }
}
