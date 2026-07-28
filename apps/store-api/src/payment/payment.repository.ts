import { Injectable } from '@nestjs/common';
import {
  OrderStatus,
  Payment,
  PaymentAttemptStatus,
  PaymentEvent,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma';
import type { PaymentEventInput } from './payment.types';

/** What a new payment attempt is created with. */
export interface CreatePaymentParams {
  orderId: string;
  /** Adapter key, e.g. `liqpay`. */
  provider: string;
  /** Decimal string, e.g. `"1249.00"`. */
  amount: string;
  currency: string;
}

/** Settlement facts learned from a provider notification. */
export interface SettlePaymentParams {
  status: PaymentAttemptStatus;
  providerPaymentId?: string;
  failureCode?: string;
  failureMessage?: string;
  settledAt?: Date;
}

/** An order whose reservation deadline has passed with no payment. */
export interface ExpiredReservation {
  id: string;
  status: OrderStatus;
  reservationExpiresAt: Date | null;
}

/**
 * PaymentRepository — the only place that touches `payments` / `payment_events`.
 *
 * Encapsulates all Prisma access for the payment module (TASK-330); the service
 * never imports PrismaClient. Two deliberate design points:
 *
 * 1. {@link insertEvent} does NOT check whether the event already exists. The
 *    unique constraint `(paymentId, providerStatus, providerPaymentId)` is the
 *    idempotency mechanism, and it is the caller's job to catch
 *    {@link isDuplicateEventError}. A `SELECT`-then-`INSERT` pre-check is exactly
 *    the bug this design avoids: two concurrent callbacks both pass it.
 * 2. {@link findExpiredReservations} READS the orders table. That is the single
 *    place this module looks outside its own tables, and it is read-only on
 *    purpose — every WRITE to an order goes through `OrderService`, so order
 *    status, stock and history can never drift apart (docs §4 rule 2).
 */
@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Open a new payment attempt. Its `id` is what goes to the provider as ITS
   * order id, so every retry of a declined card gets a fresh identifier.
   */
  create(params: CreatePaymentParams): Promise<Payment> {
    return this.prisma.payment.create({
      data: {
        orderId: params.orderId,
        provider: params.provider,
        amount: new Prisma.Decimal(params.amount),
        currency: params.currency,
      },
    });
  }

  findById(id: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { id } });
  }

  /** All attempts for an order, newest first (admin payment card, TASK-330-C). */
  findByOrderId(orderId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Append a provider notification.
   *
   * Throws Prisma `P2002` when this exact `(payment, status, provider payment
   * id)` triple has already been recorded — that rejection IS the duplicate
   * detection. See {@link isDuplicateEventError}.
   */
  insertEvent(event: PaymentEventInput): Promise<PaymentEvent> {
    return this.prisma.paymentEvent.create({
      data: {
        paymentId: event.paymentId,
        providerStatus: event.providerStatus,
        providerPaymentId: event.providerPaymentId,
        payload: event.payload as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Release an idempotency claim whose follow-up work failed.
   *
   * Without this, a transient failure between "event recorded" and "order
   * updated" would be permanent: the provider's retry would hit the unique
   * constraint, be classified as a duplicate, and the order would never be
   * marked paid. Deleting the row lets the retry (or the reconcile worker) do
   * the work properly.
   */
  async deleteEvent(id: string): Promise<void> {
    await this.prisma.paymentEvent.delete({ where: { id } });
  }

  /** Every notification recorded for a payment, oldest first (attempt history). */
  findEventsByPaymentId(paymentId: string): Promise<PaymentEvent[]> {
    return this.prisma.paymentEvent.findMany({
      where: { paymentId },
      orderBy: { receivedAt: 'asc' },
    });
  }

  /** Record the outcome of an attempt (status + provider id + error details). */
  settle(id: string, params: SettlePaymentParams): Promise<Payment> {
    return this.prisma.payment.update({
      where: { id },
      data: {
        status: params.status,
        ...(params.providerPaymentId ? { providerPaymentId: params.providerPaymentId } : {}),
        ...(params.failureCode !== undefined ? { failureCode: params.failureCode } : {}),
        ...(params.failureMessage !== undefined ? { failureMessage: params.failureMessage } : {}),
        ...(params.settledAt ? { settledAt: params.settledAt } : {}),
      },
    });
  }

  /**
   * Attempts still PENDING and older than `createdBefore` — the reconcile
   * worker's poll list.
   *
   * The grace period matters: polling a payment the customer is still typing a
   * 3DS code into just burns LiqPay API calls to be told `wait_secure`.
   */
  findPendingOlderThan(createdBefore: Date, limit: number): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { status: PaymentAttemptStatus.PENDING, createdAt: { lte: createdBefore } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /** Give up on attempts whose order's reservation deadline has passed. */
  async markExpiredByOrderId(orderId: string): Promise<number> {
    const { count } = await this.prisma.payment.updateMany({
      where: { orderId, status: PaymentAttemptStatus.PENDING },
      data: { status: PaymentAttemptStatus.EXPIRED },
    });
    return count;
  }

  /**
   * Orders whose stock reservation has expired unpaid — READ ONLY.
   *
   * Only ONLINE/INSTALLMENTS orders ever get a `reservationExpiresAt`, so the
   * deadline filter alone excludes cash-on-delivery (whose reservation is
   * indefinite by owner decision, docs §8). The remaining filters are what keeps
   * this from cancelling something it must not:
   *  - `paymentStatus: PENDING` — a paid order is never touched, even if a
   *    callback landed a second after the deadline;
   *  - pre-shipment statuses only — nothing already CONFIRMED-and-shipped,
   *    CANCELLED or REFUNDED;
   *  - `deletedAt: null` — soft-deleted orders are out of scope.
   */
  findExpiredReservations(now: Date, limit: number): Promise<ExpiredReservation[]> {
    return this.prisma.order.findMany({
      where: {
        reservationExpiresAt: { not: null, lte: now },
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: { in: [PaymentMethod.ONLINE, PaymentMethod.INSTALLMENTS] },
        status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING] },
        deletedAt: null,
      },
      select: { id: true, status: true, reservationExpiresAt: true },
      orderBy: { reservationExpiresAt: 'asc' },
      take: limit,
    });
  }
}

/**
 * Is this the unique-constraint violation that means "we have already recorded
 * this exact provider notification"?
 *
 * Exported so the service can branch on it without importing Prisma error types
 * — the check belongs with the constraint it interprets.
 */
export function isDuplicateEventError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
