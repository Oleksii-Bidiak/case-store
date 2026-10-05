import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Prisma, NotificationChannel, NotificationOutbox } from '@prisma/client';
import { NotificationOutboxRepository } from './notification-outbox.repository';
import { MailService, type SendOrderConfirmationParams } from '../mail/mail.service';
import type { PasswordResetMailPayload } from '../mail/templates/password-reset.template';
import type { AccountLockedMailPayload } from '../mail/templates/account-locked.template';
import type { EmailVerificationMailPayload } from '../mail/templates/email-verification.template';
import type { OrderShippedMailPayload } from '../mail/templates/order-shipped.template';
import type { OrderPaymentExpiredMailPayload } from '../mail/templates/order-payment-expired.template';
import type {
  EmailChangeConfirmMailPayload,
  EmailChangeNoticeMailPayload,
} from '../mail/templates/email-change.template';
import { type Clock, NOTIFICATION_OUTBOX_CLOCK } from './notification-outbox.clock';
import {
  ACCOUNT_LOCKED_MAIL_TYPE,
  EMAIL_CHANGE_CONFIRM_MAIL_TYPE,
  EMAIL_CHANGE_NOTICE_MAIL_TYPE,
  EMAIL_VERIFICATION_MAIL_TYPE,
  ORDER_CONFIRMATION_MAIL_TYPE,
  ORDER_SHIPPED_MAIL_TYPE,
  ORDER_PAYMENT_EXPIRED_MAIL_TYPE,
  PASSWORD_RESET_MAIL_TYPE,
  type DispatchResult,
} from './notification-outbox.types';
import {
  NOTIFICATION_CHANNEL_ADAPTERS,
  PermanentDeliveryError,
  type NotificationChannelAdapter,
} from './channels/notification-channel-adapter';

/** Default backoff base: first retry waits ~1 minute. */
const DEFAULT_BACKOFF_BASE_MS = 60_000;
/** Default backoff ceiling: never wait longer than ~1 hour between retries. */
const DEFAULT_BACKOFF_MAX_MS = 3_600_000;
/** Default number of due rows dispatched per tick. */
const DEFAULT_BATCH_SIZE = 20;

/**
 * NotificationOutboxService — business logic for the transactional-outbox dispatch loop
 * (TASK-103).
 *
 * {@link enqueueOrderConfirmation} writes a row (atomic with the order when a tx
 * is passed); {@link dispatchDue} is the public, scheduler-independent state
 * machine the worker ticks: claim due rows → hand each to the adapter of its
 * `channel` (TASK-673) → SENT, or on a transient failure reschedule with
 * exponential backoff until `maxAttempts` is reached, then mark terminally
 * FAILED. "Now" comes from an injected {@link Clock} so backoff windows are
 * deterministic under test.
 */
@Injectable()
export class NotificationOutboxService {
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly batchSize: number;
  private readonly isProduction: boolean;
  private readonly adapters: ReadonlyMap<NotificationChannel, NotificationChannelAdapter>;

  constructor(
    private readonly repository: NotificationOutboxRepository,
    @Inject(NOTIFICATION_CHANNEL_ADAPTERS) adapters: NotificationChannelAdapter[],
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
    @Inject(NOTIFICATION_OUTBOX_CLOCK) private readonly clock: Clock,
  ) {
    this.logger.setContext(NotificationOutboxService.name);
    const byChannel = new Map<NotificationChannel, NotificationChannelAdapter>();
    for (const adapter of adapters) {
      if (byChannel.has(adapter.channel)) {
        // Two adapters for one channel would make delivery depend on list order.
        throw new Error(`Duplicate notification channel adapter: ${adapter.channel}`);
      }
      byChannel.set(adapter.channel, adapter);
    }
    this.adapters = byChannel;
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
        recipientAddress: payload.to,
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
        recipientAddress: payload.to,
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
        recipientAddress: payload.to,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  /**
   * Enqueue an email-verification link (TASK-342).
   *
   * The recipient is the address BEING VERIFIED, carried in the payload — never
   * re-read from the user row at send time. A user who changes their address
   * again while this row is still pending would otherwise have the
   * proof-of-ownership link delivered to the new address, verifying something
   * nobody proved.
   */
  async enqueueEmailVerification(
    payload: EmailVerificationMailPayload,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.repository.enqueue(
      {
        type: EMAIL_VERIFICATION_MAIL_TYPE,
        recipientAddress: payload.to,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  /**
   * Enqueue the letter that proves a NEW address (TASK-396). The recipient is the
   * address being proven, carried in the payload — for the same reason as
   * {@link enqueueEmailVerification}: never re-derived from the user row.
   */
  async enqueueEmailChangeConfirm(
    payload: EmailChangeConfirmMailPayload,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.repository.enqueue(
      {
        type: EMAIL_CHANGE_CONFIRM_MAIL_TYPE,
        recipientAddress: payload.to,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  /**
   * Enqueue the warning, with its revert link, to the OLD address (TASK-396).
   */
  async enqueueEmailChangeNotice(
    payload: EmailChangeNoticeMailPayload,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.repository.enqueue(
      {
        type: EMAIL_CHANGE_NOTICE_MAIL_TYPE,
        recipientAddress: payload.to,
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
        recipientAddress: payload.to,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  /**
   * Enqueue «оплату не отримано» (TASK-352 (b)) — after the reconcile worker's
   * cancellation of an unpaid online order has committed. The caller enqueues
   * only on a cancel that really happened; this method does not second-guess it.
   */
  async enqueueOrderPaymentExpired(
    payload: OrderPaymentExpiredMailPayload,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.repository.enqueue(
      {
        type: ORDER_PAYMENT_EXPIRED_MAIL_TYPE,
        recipientAddress: payload.to,
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
   *
   * Each channel claims its own batch (up to `batchSize`) and goes to the adapter
   * of that channel (TASK-673). Claiming and the "transport disabled" branch are
   * both per channel, so a blocked channel — whose rows stay PENDING and due —
   * never holds back another channel's rows, and vice versa.
   */
  async dispatchDue(): Promise<DispatchResult> {
    const now = this.clock.now();
    const result: DispatchResult = { sent: 0, retried: 0, failed: 0 };

    // Only a batch that actually reached a transport earns the summary line — a
    // batch that was entirely blocked or drained has already logged its own.
    let attempted = false;

    // Every channel the schema knows, not just the registered adapters: a row of
    // a channel nobody delivers must surface through the "no adapter" branch.
    for (const channel of Object.values(NotificationChannel)) {
      const rows = await this.repository.claimDue(now, this.batchSize, channel);
      if (rows.length === 0) {
        continue;
      }
      const adapter = this.adapters.get(channel);

      if (!adapter) {
        // Same treatment as an unknown `type`: a transient failure, so the rows
        // stay visible (`lastError`, backoff, FAILED at `maxAttempts`) instead of
        // vanishing — a row nobody can deliver is a deploy/config bug to see.
        this.logger.error(
          { event: 'mailOutbox.dispatch.noAdapter', channel, count: rows.length },
          `No adapter registered for notification channel ${channel} — ${rows.length} outbox row(s) will be retried`,
        );
        const send = (): Promise<void> =>
          Promise.reject(new Error(`No adapter registered for notification channel: ${channel}`));
        for (const row of rows) {
          await this.dispatchRow(row, now, result, send);
        }
        attempted = true;
        continue;
      }

      if (!adapter.isEnabled()) {
        await this.handleDisabledChannel(adapter, rows, now, result);
        continue;
      }

      for (const row of rows) {
        await this.dispatchRow(row, now, result, (r) => adapter.send(r));
      }
      attempted = true;
    }

    if (attempted) {
      this.logger.info(
        { event: 'mailOutbox.dispatch', ...result },
        `Outbox dispatch: ${result.sent} sent, ${result.retried} retried, ${result.failed} failed`,
      );
    }
    return result;
  }

  /**
   * The "transport disabled" branch for one channel's batch — the mail-only
   * outbox's behaviour, now applied per channel, plus one case mail never had:
   * a channel that is configured but not working (Telegram before `getMe`
   * answers, or after it failed) keeps its rows PENDING outside production too.
   */
  private async handleDisabledChannel(
    adapter: NotificationChannelAdapter,
    rows: NotificationOutbox[],
    now: Date,
    result: DispatchResult,
  ): Promise<void> {
    const channel = adapter.channel;
    const isEmail = channel === NotificationChannel.EMAIL;

    if (this.isProduction) {
      // NEVER no-op-drain in production. Marking rows SENT without a transport
      // call is indistinguishable, from the outside, from actually delivering
      // them: the order looks confirmed, the outbox looks clean, and the
      // customer receives nothing — with no failure anywhere to notice.
      // Leaving them PENDING is both the honest state and the recoverable one:
      // `claimDue` is a pure read, so once the transport is configured these
      // very rows are picked up and genuinely delivered. Logged at error level
      // because a production store that cannot reach its customers is an
      // incident, not a configuration preference.
      this.logger.error(
        { event: 'mailOutbox.dispatch.blocked', channel, pending: rows.length },
        isEmail
          ? `MAIL_ENABLED is false in production — ${rows.length} outbox row(s) left PENDING and NOT delivered. Configure SMTP.`
          : `${channel} channel is not configured in production — ${rows.length} outbox row(s) left PENDING and NOT delivered.`,
      );
      return;
    }

    if (adapter.isConfigured()) {
      // Configured but down, or not verified yet: these rows are real messages a
      // working transport will deliver in a moment. Draining them here would mark
      // SENT what nobody received — the very failure the production branch exists
      // to prevent — on any non-production stand that does have a token.
      this.logger.warn(
        { event: 'mailOutbox.dispatch.blocked', channel, pending: rows.length },
        `${channel} channel is configured but not available — ${rows.length} outbox row(s) left PENDING`,
      );
      return;
    }

    // Dev/CI only: drain as a no-op so the table does not grow unboundedly on
    // a machine that has no transport for this channel and never will.
    let drained = 0;
    for (const row of rows) {
      await this.repository.markSent(row.id, now);
      result.sent += 1;
      drained += 1;
    }
    this.logger.info(
      { event: 'mailOutbox.dispatch.drained', channel, count: drained },
      isEmail
        ? `Mail disabled — drained ${drained} outbox row(s) as no-op`
        : `${channel} disabled — drained ${drained} outbox row(s) as no-op`,
    );
  }

  /**
   * Attempt to deliver a single row through `send` and apply the resulting state
   * transition. A {@link PermanentDeliveryError} fails the row at once; any other
   * error is transient (backoff until `maxAttempts`).
   */
  private async dispatchRow(
    row: NotificationOutbox,
    now: Date,
    result: DispatchResult,
    send: (row: NotificationOutbox) => Promise<void>,
  ): Promise<void> {
    try {
      await send(row);
      await this.repository.markSent(row.id, now);
      result.sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = row.attempts + 1;

      if (err instanceof PermanentDeliveryError) {
        await this.repository.markFailed(row.id, message, attempts);
        result.failed += 1;
        this.logger.error(
          {
            event: 'mailOutbox.dispatch.failed',
            id: row.id,
            channel: row.channel,
            attempts,
            permanent: true,
            error: message,
          },
          `Outbox row ${row.id} failed permanently: ${message}`,
        );
        return;
      }

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
