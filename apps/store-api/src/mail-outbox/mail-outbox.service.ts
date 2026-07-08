import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Prisma, MailOutbox } from '@prisma/client';
import { MailOutboxRepository } from './mail-outbox.repository';
import { MailService, type SendOrderConfirmationParams } from '../mail/mail.service';
import type { OrderConfirmationMailPayload } from '../mail/templates/order-confirmation.template';
import type { PasswordResetMailPayload } from '../mail/templates/password-reset.template';
import { Clock, MAIL_OUTBOX_CLOCK } from './mail-outbox.clock';
import {
  ORDER_CONFIRMATION_MAIL_TYPE,
  PASSWORD_RESET_MAIL_TYPE,
  type DispatchResult,
} from './mail-outbox.types';

/** Default backoff base: first retry waits ~1 minute. */
const DEFAULT_BACKOFF_BASE_MS = 60_000;
/** Default backoff ceiling: never wait longer than ~1 hour between retries. */
const DEFAULT_BACKOFF_MAX_MS = 3_600_000;
/** Default number of due rows dispatched per tick. */
const DEFAULT_BATCH_SIZE = 20;

/**
 * MailOutboxService — business logic for the transactional-outbox dispatch loop
 * (TASK-103).
 *
 * {@link enqueueOrderConfirmation} writes a row (atomic with the order when a tx
 * is passed); {@link dispatchDue} is the public, scheduler-independent state
 * machine the worker ticks: claim due rows → render+send → SENT, or on a
 * transient failure reschedule with exponential backoff until `maxAttempts` is
 * reached, then mark terminally FAILED. "Now" comes from an injected
 * {@link Clock} so backoff windows are deterministic under test.
 */
@Injectable()
export class MailOutboxService {
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly batchSize: number;

  constructor(
    private readonly repository: MailOutboxRepository,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Inject(MAIL_OUTBOX_CLOCK) private readonly clock: Clock,
  ) {
    this.logger.setContext(MailOutboxService.name);
    this.backoffBaseMs = this.config.get<number>(
      'MAIL_OUTBOX_BACKOFF_BASE_MS',
      DEFAULT_BACKOFF_BASE_MS,
    );
    this.backoffMaxMs = this.config.get<number>(
      'MAIL_OUTBOX_BACKOFF_MAX_MS',
      DEFAULT_BACKOFF_MAX_MS,
    );
    this.batchSize = this.config.get<number>('MAIL_OUTBOX_BATCH_SIZE', DEFAULT_BATCH_SIZE);
  }

  /**
   * Enqueue an order-confirmation email. Serializes the same data the live-send
   * path uses into a JSON-safe payload and writes a PENDING row. Pass the order's
   * transaction client `tx` so the row commits atomically with the order — the
   * whole point of the outbox pattern.
   */
  async enqueueOrderConfirmation(
    params: SendOrderConfirmationParams,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const payload = MailService.toOrderConfirmationPayload(params);
    await this.repository.enqueue(
      {
        type: ORDER_CONFIRMATION_MAIL_TYPE,
        recipient: payload.to,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  /**
   * Enqueue a password-reset email (TASK-169). Writes a PENDING row carrying the
   * JSON-safe payload (recipient, reset link, human expiry). Unlike order
   * confirmation there is no wrapping transaction to join, but the optional `tx`
   * is kept for signature symmetry with {@link enqueueOrderConfirmation}.
   */
  async enqueuePasswordReset(
    payload: PasswordResetMailPayload,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.repository.enqueue(
      {
        type: PASSWORD_RESET_MAIL_TYPE,
        recipient: payload.to,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  /**
   * Dispatch every currently-due outbox row. Public (not tied to the scheduler)
   * so it is unit-testable directly. Returns per-run counters for logging/metrics.
   */
  async dispatchDue(): Promise<DispatchResult> {
    const now = this.clock.now();
    const due = await this.repository.claimDue(now, this.batchSize);
    const result: DispatchResult = { sent: 0, retried: 0, failed: 0 };

    if (due.length === 0) {
      return result;
    }

    // Disabled-mail no-op drain: when SMTP is off (dev/CI), mark rows SENT
    // without a transport call so the table does not grow unboundedly.
    if (!this.mailService.isEnabled()) {
      for (const row of due) {
        await this.repository.markSent(row.id, now);
        result.sent += 1;
      }
      this.logger.info(
        { event: 'mailOutbox.dispatch.drained', count: result.sent },
        `Mail disabled — drained ${result.sent} outbox row(s) as no-op`,
      );
      return result;
    }

    for (const row of due) {
      await this.dispatchRow(row, now, result);
    }

    this.logger.info(
      { event: 'mailOutbox.dispatch', ...result },
      `Outbox dispatch: ${result.sent} sent, ${result.retried} retried, ${result.failed} failed`,
    );
    return result;
  }

  /** Attempt to deliver a single row and apply the resulting state transition. */
  private async dispatchRow(row: MailOutbox, now: Date, result: DispatchResult): Promise<void> {
    try {
      await this.deliver(row);
      await this.repository.markSent(row.id, now);
      result.sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = row.attempts + 1;

      if (attempts >= row.maxAttempts) {
        await this.repository.markFailed(row.id, message, attempts);
        result.failed += 1;
        this.logger.error(
          { event: 'mailOutbox.dispatch.failed', id: row.id, attempts, error: message },
          `Outbox row ${row.id} exhausted retries (${attempts}/${row.maxAttempts})`,
        );
        return;
      }

      const nextAttemptAt = new Date(now.getTime() + this.computeBackoffMs(attempts));
      await this.repository.markRetry(row.id, message, nextAttemptAt, attempts);
      result.retried += 1;
      this.logger.warn(
        {
          event: 'mailOutbox.dispatch.retry',
          id: row.id,
          attempts,
          nextAttemptAt,
          error: message,
        },
        `Outbox row ${row.id} send failed; retry ${attempts} scheduled`,
      );
    }
  }

  /**
   * Render and send a row by its `type`. An unknown type throws — caught by
   * {@link dispatchRow} and treated as a transient failure so the row is
   * rescheduled (visible via `lastError`) rather than silently lost.
   */
  private async deliver(row: MailOutbox): Promise<void> {
    switch (row.type) {
      case ORDER_CONFIRMATION_MAIL_TYPE:
        await this.mailService.sendOrderConfirmationPayload(
          row.payload as unknown as OrderConfirmationMailPayload,
        );
        return;
      case PASSWORD_RESET_MAIL_TYPE:
        await this.mailService.sendPasswordResetPayload(
          row.payload as unknown as PasswordResetMailPayload,
        );
        return;
      default:
        throw new Error(`Unknown mail outbox type: ${row.type}`);
    }
  }

  /**
   * Exponential backoff window for a given (1-based, post-increment) attempt:
   * `base * 2^(attempts-1)` — base, 2·base, 4·base, … — capped at the configured
   * maximum so a persistently-down SMTP never schedules an absurdly distant
   * retry.
   */
  private computeBackoffMs(attempts: number): number {
    const grown = this.backoffBaseMs * 2 ** (attempts - 1);
    return Math.min(grown, this.backoffMaxMs);
  }
}
