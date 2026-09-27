import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Payment, PaymentAttemptStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import type { OrderEntity } from '../order';
import { OrderService } from '../order';
import { PAYMENT_CLOCK, type Clock } from './payment.clock';
import { refundExceedsBalanceError } from './payment.errors';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment.port';
import { isDuplicateEventError, PaymentRepository } from './payment.repository';
import { PaymentOutcome, type PaymentApplyResult, type PaymentEventInput } from './payment.types';
import { PaymentCheckoutEntity, PaymentEntity } from './entities';

/** Order statuses that may still be paid for. */
const PAYABLE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
]);

/**
 * PaymentService — attempts, idempotency, and the hand-off to the order module.
 *
 * The three rules this class exists to enforce (docs/payments-liqpay.md §3–§4):
 *
 * 1. **The provider is told the PAYMENT id, never the order id.** Providers
 *    refuse a second payment under an `order_id` they have seen, so one order
 *    holds many {@link Payment} rows and a declined card can be retried.
 * 2. **Idempotency lives in the database.** A repeat callback is detected by the
 *    unique constraint on `PaymentEvent` rejecting the insert — never by a
 *    `SELECT` first, which two concurrent callbacks both pass.
 * 3. **This module never writes to an order.** Order status, `paidAt`, the
 *    reservation deadline, stock and history all move together inside
 *    {@link OrderService.applyPaymentEvent}, or they drift apart.
 */
@Injectable()
export class PaymentService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly orderService: OrderService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_CLOCK) private readonly clock: Clock,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PaymentService.name);
  }

  /** Whether online payment can be offered at all (keys configured). */
  isAvailable(): boolean {
    return this.provider.isConfigured();
  }

  /**
   * Open a payment attempt for an order and build the provider handoff.
   *
   * The caller is responsible for authorization — pass an order the requester is
   * entitled to pay for (the controller obtains it via
   * {@link OrderService.getOrder}, which enforces ownership).
   *
   * Called again after a declined card, this produces a NEW attempt with a new
   * id. That is the retry mechanism, not a bug.
   *
   * @throws ServiceUnavailableException when the provider has no credentials.
   * @throws ConflictException when the order is already paid or no longer payable.
   */
  async createCheckout(order: OrderEntity): Promise<PaymentCheckoutEntity> {
    if (!this.provider.isConfigured()) {
      throw new ServiceUnavailableException('Online payment is not available');
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new ConflictException('Order is already paid');
    }

    if (!PAYABLE_STATUSES.has(order.status)) {
      throw new ConflictException(`Order in status ${order.status} cannot be paid`);
    }

    const payment = await this.paymentRepository.create({
      orderId: order.id,
      provider: this.provider.key,
      amount: order.total,
      currency: 'UAH',
    });

    const handoff = await this.provider.createCheckout({
      // The Payment id — see rule 1 in the class docblock.
      paymentId: payment.id,
      amount: payment.amount.toString(),
      currency: payment.currency,
      description: `Замовлення №${order.id.slice(0, 8)}`,
      resultUrl: `${this.storefrontOrigin()}/orders/${order.id}/confirmation`,
      callbackUrl: `${this.apiOrigin()}/api/payments/${this.provider.key}/callback`,
      // TASK-352 (a): the page stops taking money when the reservation lapses,
      // so a page opened at 14:25 cannot charge at 14:35 for an order the TTL
      // worker has cancelled and whose stock is back on sale.
      // (The entity carries it as an ISO string.)
      ...(order.reservationExpiresAt ? { expiresAt: new Date(order.reservationExpiresAt) } : {}),
    });

    this.logger.info(
      {
        event: 'payment.checkout.created',
        paymentId: payment.id,
        orderId: order.id,
        provider: this.provider.key,
      },
      'Payment attempt opened',
    );

    const entity = new PaymentCheckoutEntity();
    entity.paymentId = payment.id;
    entity.url = handoff.url;
    entity.method = handoff.method;
    entity.fields = handoff.fields;
    return entity;
  }

  /**
   * Handle a raw provider callback body.
   *
   * Returns `null` when the signature does not verify — the controller answers
   * 400 and nothing changes. Every other outcome resolves, because a provider
   * that does not get a 200 retries forever.
   */
  async handleCallback(body: unknown): Promise<PaymentApplyResult | null> {
    const event = await this.provider.parseCallback(body);

    if (!event) {
      this.logger.warn(
        { event: 'payment.callback.rejected' },
        'Provider callback rejected: signature or payload invalid',
      );
      return null;
    }

    return this.applyEvent(event);
  }

  /**
   * Record a translated provider notification and apply it to the order.
   *
   * Shared by the webhook and the reconcile worker on purpose: both must get the
   * same idempotency, the same money verification and the same single write path
   * into the order module.
   *
   * @throws BadRequestException when the reported money does not match the attempt.
   */
  async applyEvent(reported: PaymentEventInput): Promise<PaymentApplyResult> {
    const payment = await this.paymentRepository.findById(reported.paymentId);

    if (!payment) {
      // The signature verified, so this is genuinely from the provider — but it
      // names a payment we have no record of. Retrying cannot help, so answer
      // "nothing to do" and make the log loud enough to investigate.
      this.logger.error(
        { event: 'payment.event.unknown_payment', paymentId: reported.paymentId },
        'Verified provider event references an unknown payment',
      );
      return { applied: false, orderId: '' };
    }

    this.assertMoneyMatches(payment, reported);
    const event = this.classifyRefund(payment, reported);

    // The idempotency claim. A duplicate INSERT is rejected by the unique
    // constraint on (paymentId, providerStatus, providerPaymentId) — that
    // rejection IS the duplicate check (rule 2).
    let eventId: string;
    try {
      eventId = (await this.paymentRepository.insertEvent(event)).id;
    } catch (err) {
      if (isDuplicateEventError(err)) {
        this.logger.info(
          {
            event: 'payment.event.duplicate',
            paymentId: payment.id,
            providerStatus: event.providerStatus,
          },
          'Duplicate provider event ignored',
        );
        return { applied: false, orderId: payment.orderId };
      }
      throw err;
    }

    try {
      // "Still working on it" (3DS, OTP, wait_secure, …) is recorded for the
      // audit trail and goes no further. Treating not-finished-yet as an event
      // to act on is how an order flips to paid before the money exists.
      if (event.outcome === PaymentOutcome.IGNORED) {
        this.logger.debug(
          {
            event: 'payment.event.in_progress',
            paymentId: payment.id,
            providerStatus: event.providerStatus,
          },
          'Provider event recorded but not actionable',
        );
        return { applied: false, orderId: payment.orderId };
      }

      const result = await this.orderService.applyPaymentEvent(event);
      await this.settle(payment, event);

      this.logger.info(
        {
          event: 'payment.event.applied',
          paymentId: payment.id,
          orderId: payment.orderId,
          outcome: event.outcome,
          providerStatus: event.providerStatus,
          applied: result.applied,
        },
        'Provider event applied',
      );

      return result;
    } catch (err) {
      // Release the idempotency claim, or a transient failure here becomes
      // permanent: the provider's retry would be classified as a duplicate and
      // the order would never be marked paid.
      await this.releaseClaim(eventId, payment.id);
      throw err;
    }
  }

  /**
   * Ask the provider to send money back.
   *
   * Returns as soon as the provider ACCEPTS. It does not set REFUNDED — that is
   * confirmed by the `reversed` callback which comes back through
   * {@link applyEvent}, so the label can never claim a refund that did not
   * happen (edge case E-12).
   *
   * The ceiling is what is LEFT on the attempt — `amount - refundedAmount` —
   * not what it charged (TASK-1302): a partial refund leaves the attempt
   * SUCCEEDED, so checking against the charge alone let 600 + 500 out of 1000
   * both through. The amount is reserved by one conditional UPDATE before the
   * provider is called, so two simultaneous requests cannot both spend the same
   * remainder; if the provider refuses, the reservation is given back.
   * Omitting `amount` refunds the remainder.
   *
   * @throws NotFoundException when the payment does not exist.
   * @throws ConflictException when the attempt never succeeded.
   * @throws BadRequestException for a zero amount, or one above the remainder
   *   (`PAYMENT_REFUND_EXCEEDS_BALANCE`).
   */
  async refund(paymentId: string, amount?: string): Promise<void> {
    const payment = await this.paymentRepository.findById(paymentId);

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    this.assertRefundable(payment);

    const remaining = payment.amount.minus(payment.refundedAmount);
    const refundAmount = amount ?? remaining.toString();

    if (amount !== undefined && !new Prisma.Decimal(amount).greaterThan(0)) {
      throw new BadRequestException('Refund amount must be more than zero');
    }

    if (!remaining.greaterThan(0) || new Prisma.Decimal(refundAmount).greaterThan(remaining)) {
      throw refundExceedsBalanceError(refundAmount, remaining.toString());
    }

    if (!(await this.paymentRepository.reserveRefund(payment.id, refundAmount))) {
      // Lost a race: another refund took the balance, or the attempt moved on
      // (a full `reversed` callback) between the read and the reservation.
      const fresh = await this.paymentRepository.findById(payment.id);
      if (!fresh) throw new NotFoundException('Payment not found');
      this.assertRefundable(fresh);
      throw refundExceedsBalanceError(
        refundAmount,
        fresh.amount.minus(fresh.refundedAmount).toString(),
      );
    }

    try {
      await this.provider.refund({ paymentId: payment.id, amount: refundAmount });
    } catch (err) {
      await this.paymentRepository.releaseRefund(payment.id, refundAmount);
      throw err;
    }

    this.logger.info(
      {
        event: 'payment.refund.requested',
        paymentId: payment.id,
        amount: refundAmount,
        remainingBefore: remaining.toString(),
      },
      'Refund requested; awaiting the provider callback that confirms it',
    );
  }

  /** All attempts for an order, newest first (admin payment card). */
  async getAttemptsForOrder(orderId: string): Promise<PaymentEntity[]> {
    const payments = await this.paymentRepository.findByOrderId(orderId);
    return payments.map((payment) => PaymentEntity.fromPrisma(payment));
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Only a SUCCEEDED attempt has money to send back. */
  private assertRefundable(payment: Payment): void {
    if (payment.status !== PaymentAttemptStatus.SUCCEEDED) {
      throw new ConflictException(`Cannot refund a payment in status ${payment.status}`);
    }
  }

  /**
   * Refuse an event whose money does not match what we asked for.
   *
   * Without this a tampered amount is accepted as payment in full: an attacker
   * who could influence the callback would pay 1 UAH for a 10 000 UAH order.
   * Checked BEFORE the event is recorded, so a rejected event does not consume
   * its idempotency key.
   *
   * Scope of the check is deliberate:
   *  - SUCCEEDED must match exactly — the whole amount, in the currency invoiced.
   *  - REFUNDED must be in the same currency, more than zero and no more than
   *    we charged; a partial refund legitimately reports less, and
   *    {@link classifyRefund} then relabels it PARTIALLY_REFUNDED so the order
   *    module's exact-amount check agrees with this one (TASK-618).
   *  - FAILED / IGNORED move no money, and providers routinely omit the amount
   *    on them, so there is nothing to verify.
   */
  private assertMoneyMatches(payment: Payment, event: PaymentEventInput): void {
    if (event.outcome !== PaymentOutcome.SUCCEEDED && event.outcome !== PaymentOutcome.REFUNDED) {
      return;
    }

    const reject = (reason: string): never => {
      this.logger.error(
        {
          event: 'payment.event.money_mismatch',
          paymentId: payment.id,
          orderId: payment.orderId,
          expectedAmount: payment.amount.toString(),
          expectedCurrency: payment.currency,
          reportedAmount: event.amount,
          reportedCurrency: event.currency,
          reason,
        },
        'Provider event rejected: reported money does not match the payment',
      );
      throw new BadRequestException('Reported amount or currency does not match the payment');
    };

    if (event.currency.toUpperCase() !== payment.currency.toUpperCase()) {
      reject('currency mismatch');
    }

    let reported: Prisma.Decimal;
    try {
      reported = new Prisma.Decimal(event.amount);
    } catch {
      return reject('unparsable amount');
    }

    if (event.outcome === PaymentOutcome.SUCCEEDED && !reported.equals(payment.amount)) {
      reject('amount mismatch');
    }

    if (event.outcome === PaymentOutcome.REFUNDED && reported.greaterThan(payment.amount)) {
      reject('refund exceeds the amount paid');
    }

    if (event.outcome === PaymentOutcome.REFUNDED && !reported.greaterThan(0)) {
      reject('refund of nothing');
    }
  }

  /**
   * Decide whether a refund is partial or full (TASK-618).
   *
   * The adapter cannot: a provider reports `reversed` either way, and the adapter
   * never sees what was charged. This class holds the Payment row, so it decides,
   * and the order module receives an outcome with an exact amount contract —
   * REFUNDED means the whole charge, PARTIALLY_REFUNDED strictly less. Called
   * only after {@link assertMoneyMatches}, so the amount is known to parse and to
   * lie in (0, charged].
   */
  private classifyRefund(payment: Payment, event: PaymentEventInput): PaymentEventInput {
    if (event.outcome !== PaymentOutcome.REFUNDED) return event;
    if (!new Prisma.Decimal(event.amount).lessThan(payment.amount)) return event;
    return { ...event, outcome: PaymentOutcome.PARTIALLY_REFUNDED };
  }

  /** Record the attempt's outcome on the Payment row. */
  private async settle(payment: Payment, event: PaymentEventInput): Promise<void> {
    // A partial refund leaves the attempt SUCCEEDED — part of the money is still
    // ours, and `refund()` accepts only a SUCCEEDED attempt, so anything else
    // would block refunding the remainder. It does not move `settledAt` (the
    // attempt settled when the money arrived) and never downgrades an attempt
    // that is already fully REFUNDED.
    if (event.outcome === PaymentOutcome.PARTIALLY_REFUNDED) {
      await this.paymentRepository.settle(payment.id, {
        status:
          payment.status === PaymentAttemptStatus.REFUNDED
            ? PaymentAttemptStatus.REFUNDED
            : PaymentAttemptStatus.SUCCEEDED,
        ...(event.providerPaymentId ? { providerPaymentId: event.providerPaymentId } : {}),
      });
      return;
    }

    const status = {
      [PaymentOutcome.SUCCEEDED]: PaymentAttemptStatus.SUCCEEDED,
      [PaymentOutcome.FAILED]: PaymentAttemptStatus.FAILED,
      [PaymentOutcome.REFUNDED]: PaymentAttemptStatus.REFUNDED,
    }[
      event.outcome as Exclude<
        PaymentOutcome,
        PaymentOutcome.IGNORED | PaymentOutcome.PARTIALLY_REFUNDED
      >
    ];

    await this.paymentRepository.settle(payment.id, {
      status,
      ...(event.providerPaymentId ? { providerPaymentId: event.providerPaymentId } : {}),
      ...(event.failureCode !== undefined ? { failureCode: event.failureCode } : {}),
      ...(event.failureMessage !== undefined ? { failureMessage: event.failureMessage } : {}),
      settledAt: this.clock.now(),
    });
  }

  /**
   * Undo an idempotency claim after downstream work failed. Best effort: if even
   * the delete fails, log it and let the original error surface — the reconcile
   * worker is the backstop.
   */
  private async releaseClaim(eventId: string, paymentId: string): Promise<void> {
    try {
      await this.paymentRepository.deleteEvent(eventId);
    } catch (err) {
      this.logger.error(
        { event: 'payment.event.claim_release_failed', eventId, paymentId, err },
        'Could not release the payment-event idempotency claim; a retry will be seen as a duplicate',
      );
    }
  }

  /** Public origin of the storefront the customer is sent back to. */
  private storefrontOrigin(): string {
    return this.trimSlash(this.config.get<string>('STORE_CLIENT_URL', 'http://localhost:3000'));
  }

  /** Public origin of THIS api — where the provider POSTs its callback. */
  private apiOrigin(): string {
    return this.trimSlash(this.config.get<string>('PUBLIC_BASE_URL', 'http://localhost:3001'));
  }

  private trimSlash(url: string): string {
    return url.replace(/\/+$/, '');
  }
}
