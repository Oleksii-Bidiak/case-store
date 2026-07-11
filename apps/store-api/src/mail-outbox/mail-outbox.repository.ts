import { Injectable } from '@nestjs/common';
import { Prisma, MailOutbox, MailOutboxStatus } from '@prisma/client';
import { PrismaService } from '../prisma';

/** Data required to enqueue a new outbox row. */
export interface EnqueueMailParams {
  /** Discriminator selecting the renderer (e.g. `order-confirmation`). */
  type: string;
  /** Destination address (denormalized from the payload for quick inspection). */
  recipient: string;
  /** JSON-serializable payload rendered at send time. */
  payload: Prisma.InputJsonValue;
  /** Override the schema default (5) retry ceiling for this row. */
  maxAttempts?: number;
}

/**
 * MailOutboxRepository — the only place that touches the `mail_outbox` table.
 *
 * Encapsulates all Prisma access for the transactional-outbox pattern
 * (TASK-103): {@link enqueue} is **tx-aware** so an order-confirmation row can
 * be written inside the order's `$transaction` (atomic with the order), while
 * {@link claimDue} and the status-transition writers run on the base client
 * from the background retry worker.
 */
@Injectable()
export class MailOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert a PENDING outbox row. When a transaction client `tx` is supplied the
   * row is written through it, so it commits (or rolls back) atomically with the
   * caller's other writes; otherwise it goes to the base Prisma client.
   */
  enqueue(params: EnqueueMailParams, tx?: Prisma.TransactionClient): Promise<MailOutbox> {
    const client = tx ?? this.prisma;
    return client.mailOutbox.create({
      data: {
        type: params.type,
        recipient: params.recipient,
        payload: params.payload,
        ...(params.maxAttempts !== undefined ? { maxAttempts: params.maxAttempts } : {}),
      },
    });
  }

  /**
   * Claim the rows due for dispatch: PENDING and `nextAttemptAt <= now`, oldest
   * first (by next-attempt then creation time), capped at `limit`. The worker
   * flips each row's status immediately after, so a row is not re-claimed by the
   * next tick (single-instance cron for MVP; multi-instance would need row
   * locking — out of scope per plan 092).
   */
  claimDue(now: Date, limit: number): Promise<MailOutbox[]> {
    return this.prisma.mailOutbox.findMany({
      where: { status: MailOutboxStatus.PENDING, nextAttemptAt: { lte: now } },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });
  }

  /**
   * Whether a row of `type` was enqueued for `recipient` at or after `since`
   * (TASK-287). Status-agnostic on purpose: the question is "did we already
   * decide to mail this address recently?", so a row still PENDING, already
   * SENT, or terminally FAILED all count — otherwise a broken SMTP would turn
   * the rate limit off.
   */
  async hasRecentByTypeAndRecipient(
    type: string,
    recipient: string,
    since: Date,
  ): Promise<boolean> {
    const existing = await this.prisma.mailOutbox.findFirst({
      where: { type, recipient, createdAt: { gte: since } },
      select: { id: true },
    });
    return existing !== null;
  }

  /** Mark a row delivered: SENT + `sentAt`, clearing any prior transient error. */
  markSent(id: string, sentAt: Date): Promise<MailOutbox> {
    return this.prisma.mailOutbox.update({
      where: { id },
      data: { status: MailOutboxStatus.SENT, sentAt, lastError: null },
    });
  }

  /**
   * Reschedule a row after a transient failure: stays PENDING, records the new
   * attempt count, the error, and the backoff-computed `nextAttemptAt`.
   */
  markRetry(id: string, error: string, nextAttemptAt: Date, attempts: number): Promise<MailOutbox> {
    return this.prisma.mailOutbox.update({
      where: { id },
      data: { status: MailOutboxStatus.PENDING, attempts, lastError: error, nextAttemptAt },
    });
  }

  /** Mark a row terminally FAILED (retries exhausted), recording the last error. */
  markFailed(id: string, error: string, attempts: number): Promise<MailOutbox> {
    return this.prisma.mailOutbox.update({
      where: { id },
      data: { status: MailOutboxStatus.FAILED, attempts, lastError: error },
    });
  }
}
