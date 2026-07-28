import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Prisma, MailOutbox } from '@prisma/client';
import { MailOutboxRepository } from './mail-outbox.repository';
import { MailService, type SendOrderConfirmationParams } from '../mail/mail.service';
import type { OrderConfirmationMailPayload } from '../mail/templates/order-confirmation.template';
import type { PasswordResetMailPayload } from '../mail/templates/password-reset.template';
import type { AccountLockedMailPayload } from '../mail/templates/account-locked.template';
import type { OrderShippedMailPayload } from '../mail/templates/order-shipped.template';
import { Clock, MAIL_OUTBOX_CLOCK } from './mail-outbox.clock';
import {
  ACCOUNT_LOCKED_MAIL_TYPE,
  ORDER_CONFIRMATION_MAIL_TYPE,
  ORDER_SHIPPED_MAIL_TYPE,
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
  private readonly isProduction: boolean;

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
    this.isProduction = this.config.get<string>('NODE_ENV') === 'production';
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
   * Enqueue an account-locked owner notice (TASK-287) — the out-of-band channel
   * that tells the owner of a deactivated/soft-deleted account why their (valid)
   * password did not get them in, while the API response stays generic.
   */
  async enqueueAccountLockedNotice(
    payload: AccountLockedMailPayload,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.repository.enqueue(
      {
        type: ACCOUNT_LOCKED_MAIL_TYPE,
        recipient: payload.to,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  /**
   * Enqueue the "your order has shipped" notice (TASK-335).
   *
   * Takes an optional `tx` like its siblings so a caller that ships an order and
   * notifies the customer can commit both together — a notice for a shipment that
   * rolled back is worse than none.
   */
  async enqueueOrderShipped(
    payload: OrderShippedMailPayload,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.repository.enqueue(
      {
        type: ORDER_SHIPPED_MAIL_TYPE,
        recipient: payload.to,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  /**
   * Whether an account-locked notice was already enqueued for `recipient` at or
   * after `since` — the rate-limit probe callers use before
   * {@link enqueueAccountLockedNotice}. Reuses the outbox rows themselves as the
   * ledger, so repeated logins to a banned account cannot be turned into a mail
   * bomb aimed at the owner.
   */
  hasRecentAccountLockedNotice(recipient: string, since: Date): Promise<boolean> {
    return this.repository.hasRecentByTypeAndRecipient(ACCOUNT_LOCKED_MAIL_TYPE, recipient, since);
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

    if (!this.mailService.isEnabled()) {
      if (this.isProduction) {
        // NEVER no-op-drain in production. Marking rows SENT without a transport
        // call is indistinguishable, from the outside, from actually delivering
        // them: the order looks confirmed, the outbox looks clean, and the
        // customer receives nothing — with no failure anywhere to notice.
        // Leaving them PENDING is both the honest state and the recoverable one:
        // `claimDue` is a pure read, so once SMTP is configured these very rows
        // are picked up and genuinely delivered. Logged at error level because a
        // production store that cannot email its customers is an incident, not a
        // configuration preference.
        this.logger.error(
          { event: 'mailOutbox.dispatch.blocked', pending: due.length },
          `MAIL_ENABLED is false in production — ${due.length} outbox row(s) left PENDING and NOT delivered. Configure SMTP.`,
        );
        return result;
      }

      // Dev/CI only: drain as a no-op so the table does not grow unboundedly on
      // a machine that has no SMTP transport and never will.
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
      case ORDER_SHIPPED_MAIL_TYPE:
        await this.mailService.sendOrderShippedPayload(
          row.payload as unknown as OrderShippedMailPayload,
        );
        return;
      case ACCOUNT_LOCKED_MAIL_TYPE:
        await this.mailService.sendAccountLockedPayload(
          row.payload as unknown as AccountLockedMailPayload,
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
