import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  Payment,
  PaymentAttemptStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { centsToString, toCents } from '../addon-service';
import type { LedgerRefundRequest, OrderEntity, ProviderRefundPort } from '../order';
import {
  deliveryPaymentNotAllowedError,
  isPaymentAllowedForDelivery,
  moneyRefundExceedsPaidError,
  OrderService,
} from '../order';
import { PAYMENT_CLOCK, type Clock } from './payment.clock';
import {
  checkoutBankTransferError,
  checkoutPartlyPaidError,
  refundExceedsBalanceError,
} from './payment.errors';
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
export class PaymentService implements ProviderRefundPort {
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
   * @throws BadRequestException (`DELIVERY_PAYMENT_NOT_ALLOWED`) when the order's
   *   delivery method admits no online payment (OTHER — shipping not quoted yet).
   */
  async createCheckout(order: OrderEntity): Promise<PaymentCheckoutEntity> {
    if (!this.provider.isConfigured()) {
      throw new ServiceUnavailableException('Online payment is not available');
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new ConflictException('Order is already paid');
    }

    // TASK-2340 (R2 A4): an attempt charges the WHOLE total. A bank-transfer
    // order is paid outside LiqPay, and an order with money already in
    // (PARTIALLY_PAID, or anything paid since) would be charged twice.
    if (order.paymentMethod === PaymentMethod.BANK_TRANSFER) {
      throw checkoutBankTransferError();
    }
    if ((order.paidKop ?? 0) > 0) {
      throw checkoutPartlyPaidError();
    }

    if (!PAYABLE_STATUSES.has(order.status)) {
      throw new ConflictException(`Order in status ${order.status} cannot be paid`);
    }

    // The delivery × payment matrix (TASK-643) is checked where money moves, not
    // only at order creation: an OTHER order placed as cash on delivery must not
    // be paid online here, because its total does not include shipping yet.
    if (!isPaymentAllowedForDelivery(order.deliveryMethod, PaymentMethod.ONLINE)) {
      throw deliveryPaymentNotAllowedError(order.deliveryMethod);
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
  async applyEvent(event: PaymentEventInput): Promise<PaymentApplyResult> {
    const payment = await this.paymentRepository.findById(event.paymentId);

    if (!payment) {
      // The signature verified, so this is genuinely from the provider — but it
      // names a payment we have no record of. Retrying cannot help, so answer
      // "nothing to do" and make the log loud enough to investigate.
      this.logger.error(
        { event: 'payment.event.unknown_payment', paymentId: event.paymentId },
        'Verified provider event references an unknown payment',
      );
      return { applied: false, orderId: '' };
    }

    this.assertMoneyMatches(payment, event);

    // The idempotency claim. A duplicate INSERT is rejected by the unique
    // constraint on (paymentId, providerStatus, providerPaymentId, dedupeKey) —
    // that rejection IS the duplicate check (rule 2). The dedupe key (TASK-1500)
    // keeps a second PARTIAL refund from colliding with the first.
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
   * Ask the provider to send money back (TASK-1500 / TASK-2047, R2 A2).
   *
   * 1. The refund is written to the order ledger FIRST — OUT `LIQPAY_REFUND`,
   *    `REQUESTED`, under the order-row lock — by {@link OrderService.requestProviderRefund}.
   *    It counts as refunded from that moment, so the ceiling (what is left on
   *    the attempt, and never more than the order's `paid − refunded` across
   *    every kind — TASK-951) holds for a second request racing this one: the
   *    lock serialises them and the second sees the first.
   * 2. Then the provider is asked. If it refuses (or the call throws), the
   *    entry is VOIDED and stops counting; the error is rethrown.
   * 3. It is NOT marked confirmed here — the `reversed` callback (or the
   *    reconcile poll) does that through {@link applyEvent}, so the record can
   *    never claim a refund the provider did not make (edge case E-12).
   *
   * `Payment.refundedAmount` is no longer read or written. Omitting `amount`
   * refunds the remainder.
   *
   * @throws NotFoundException when the payment does not exist.
   * @throws ConflictException when the attempt never succeeded.
   * @throws BadRequestException for a zero amount, or one above the ceiling
   *   (`PAYMENT_REFUND_EXCEEDS_BALANCE`).
   */
  async refund(paymentId: string, amount?: string, actorId: string | null = null): Promise<void> {
    const payment = await this.paymentRepository.findById(paymentId);

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    this.assertRefundable(payment);

    const amountKop = amount === undefined ? undefined : toCents(amount);
    if (amountKop !== undefined && !(amountKop > 0)) {
      throw new BadRequestException('Refund amount must be more than zero');
    }

    const request = await this.orderService.requestProviderRefund({
      orderId: payment.orderId,
      paymentId: payment.id,
      amountKop,
      actorId,
    });

    if (request.status === 'exceeds') {
      const available = centsToString(request.availableKop);
      throw refundExceedsBalanceError(amount ?? available, available);
    }

    await this.askProviderToRefund(payment, request.entryId, request.amountKop);
  }

  /**
   * The operator's LIQPAY_REFUND payout (R2 A3) — `PROVIDER_REFUND_PORT`, bound to
   * this class in `PaymentModule`. The same REQUESTED → provider → void flow as
   * {@link refund}; the order module's payout rules (`request.guard`) run inside
   * the transaction that writes the entry, right after the order-row lock, and
   * the entry carries the return it settles and the operator's reason.
   *
   * @throws NotFoundException when the payment does not exist or is not this order's.
   * @throws ConflictException when the attempt never succeeded, whatever the
   *   guard throws, or ORDER_MONEY_REFUND_EXCEEDS_PAID over what is left on the
   *   attempt.
   */
  async requestLedgerRefund(request: LedgerRefundRequest): Promise<void> {
    const payment = await this.paymentRepository.findById(request.paymentId);

    // A payment of another order is reported exactly like a missing one.
    if (!payment || payment.orderId !== request.orderId) {
      throw new NotFoundException('Payment not found');
    }

    this.assertRefundable(payment);

    const written = await this.orderService.requestProviderRefund({
      orderId: request.orderId,
      paymentId: payment.id,
      amountKop: request.amountKop,
      actorId: request.actorId,
      returnId: request.returnId,
      reason: request.reason,
      guard: request.guard,
    });

    if (written.status === 'exceeds') {
      throw moneyRefundExceedsPaidError(request.amountKop, written.availableKop);
    }

    await this.askProviderToRefund(payment, written.entryId, written.amountKop);
  }

  /** Ask LiqPay for a refund already REQUESTED on the ledger; void it if LiqPay refuses. */
  private async askProviderToRefund(
    payment: Payment,
    entryId: string,
    amountKop: number,
  ): Promise<void> {
    const refundAmount = centsToString(amountKop);
    try {
      await this.provider.refund({ paymentId: payment.id, amount: refundAmount });
    } catch (err) {
      await this.voidRefund(payment, entryId, err);
      throw err;
    }

    this.logger.info(
      {
        event: 'payment.refund.requested',
        paymentId: payment.id,
        orderId: payment.orderId,
        entryId,
        amount: refundAmount,
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
   *    we charged. Whether LiqPay reports the single refund or the running
   *    total is not confirmed (TASK-1500), so the amount is only sanity-checked
   *    and logged: the money of a refund is what the shop requested.
   *  - FAILED / IGNORED move no money, and providers routinely omit the amount
   *    on them, so there is nothing to verify.
   */
  private assertMoneyMatches(payment: Payment, event: PaymentEventInput): void {
    const isRefund =
      event.outcome === PaymentOutcome.REFUNDED ||
      event.outcome === PaymentOutcome.PARTIALLY_REFUNDED;
    if (event.outcome !== PaymentOutcome.SUCCEEDED && !isRefund) {
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

    if (isRefund && reported.greaterThan(payment.amount)) {
      reject('refund exceeds the amount paid');
    }

    if (isRefund && !reported.greaterThan(0)) {
      reject('refund of nothing');
    }
  }

  /**
   * Record the attempt's outcome on the Payment row.
   *
   * A refund event is NOT settled here (TASK-1500, R2 A2): which refund it
   * confirms, and whether the attempt is now fully REFUNDED, is decided by the
   * order module from the ledger, in the same locked transaction — settling
   * from the event's amount would mark a partial refund as a full one.
   */
  private async settle(payment: Payment, event: PaymentEventInput): Promise<void> {
    if (
      event.outcome === PaymentOutcome.REFUNDED ||
      event.outcome === PaymentOutcome.PARTIALLY_REFUNDED ||
      event.outcome === PaymentOutcome.IGNORED
    ) {
      return;
    }

    await this.paymentRepository.settle(payment.id, {
      status:
        event.outcome === PaymentOutcome.SUCCEEDED
          ? PaymentAttemptStatus.SUCCEEDED
          : PaymentAttemptStatus.FAILED,
      ...(event.providerPaymentId ? { providerPaymentId: event.providerPaymentId } : {}),
      ...(event.failureCode !== undefined ? { failureCode: event.failureCode } : {}),
      ...(event.failureMessage !== undefined ? { failureMessage: event.failureMessage } : {}),
      settledAt: this.clock.now(),
    });
  }

  /**
   * Void a REQUESTED refund the provider refused. Best effort: if the void
   * itself fails, the entry stays REQUESTED (and counted, so the ceiling errs
   * on the side of refunding LESS) and the failure is logged loudly; the
   * provider's own error is what the caller sees.
   */
  private async voidRefund(payment: Payment, entryId: string, cause: unknown): Promise<void> {
    const reason = `Provider refused the refund: ${
      cause instanceof Error ? cause.message : String(cause)
    }`;
    try {
      await this.orderService.voidProviderRefund(payment.orderId, entryId, reason);
    } catch (err) {
      this.logger.error(
        { event: 'payment.refund.void_failed', paymentId: payment.id, entryId, err },
        'Could not void a refused refund; the ledger still counts it as requested',
      );
    }
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
