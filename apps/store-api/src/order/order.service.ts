import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { OrderStatus, PaymentStatus, PaymentAttemptStatus } from '@prisma/client';
import { OrderRepository } from './order.repository';
import { CartRepository, type CartWithItems } from '../cart/cart.repository';
import { UserRepository } from '../user/user.repository';
import { MailOutboxService } from '../mail-outbox';
import { DeliveryService } from '../delivery';
import { DiscountService } from '../discount';
import { OrderEntity, OrderStatusHistoryEntity } from './entities';
import { PRE_SHIPMENT_STATUSES } from './order.constants';
import { allowedTransitions, canTransition } from './order-state-machine';
import { invalidTransitionError, staleOrderError } from './order.errors';
import { AddonApplicabilityResolver } from '../addon-service';
import type { CreateOrderDto, OrderListQueryDto, AdminOrderListQueryDto } from './dto';
import type {
  CreateOrderParams,
  OrderAddonSnapshot,
  PaymentApplyPlan,
  PaymentWithOrderRow,
} from './order.types';
import type { PaymentApplyResult, PaymentEventInput } from '../payment/payment.types';
import { PaymentOutcome } from '../payment/payment.types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

/**
 * Whether a status transition should automatically return reserved stock to
 * inventory (TASK-124).
 *
 * Stock is reserved when the order is created. Auto-restock applies ONLY when an
 * order is cancelled before it ships — the goods never left the warehouse. Once
 * shipped or delivered, the physical item is with the carrier/customer; bringing
 * it back to sellable stock requires a manual admin adjustment after the return
 * is received, so SHIPPED/DELIVERED cancels and all REFUNDED transitions are NOT
 * auto-restocked. Cancelling an already-cancelled order is a no-op (the guard is
 * false), preventing a double stock credit.
 */
function shouldAutoRestock(currentStatus: OrderStatus, targetStatus: OrderStatus): boolean {
  return targetStatus === OrderStatus.CANCELLED && PRE_SHIPMENT_STATUSES.has(currentStatus);
}

/**
 * Pagination metadata returned alongside a list of orders.
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * OrderService — business logic for placing and managing orders.
 *
 * An order is created from the authenticated user's current cart: prices are
 * snapshotted, the cart is emptied, and (for variant lines) stock is
 * decremented — all atomically in the repository. Customers may view their own
 * orders and cancel a still-PENDING order. Status transitions driven by the
 * payment webhook/admin use {@link updateStatus} (no ownership check).
 */
@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly cartRepository: CartRepository,
    private readonly userRepository: UserRepository,
    private readonly mailOutbox: MailOutboxService,
    private readonly deliveryService: DeliveryService,
    private readonly discountService: DiscountService,
    private readonly addonResolver: AddonApplicabilityResolver,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OrderService.name);
  }

  /**
   * Create an order from the user's current cart.
   *
   * @throws ForbiddenException when the placing account is deactivated (banned).
   * @throws NotFoundException when the user has no cart.
   * @throws BadRequestException when the cart is empty or a variant has
   *   insufficient stock at order-creation time.
   */
  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderEntity> {
    // Ban enforcement (TASK-150): a deactivated account must not place an order
    // even while it still holds a non-expired access token. Refresh tokens are
    // revoked the moment a user is banned, but the short-lived access token
    // remains valid until it expires — so re-check active status here, as the
    // first operation, before any cart lookup or inventory write. The same user
    // object is reused for the confirmation email below (single fetch).
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    const cart = await this.cartRepository.findByUserId(userId);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty — add items before placing an order');
    }

    // Re-validate every line at order-creation time — state may have changed
    // since add-to-cart. A line must still be ON SALE (its product AND its
    // category active, TASK-297) and hold enough stock; both gates mirror
    // CartService.validateAddition. This is the authoritative checkout backstop:
    // the add-to-cart and GET /cart gates never re-run for a line withdrawn
    // AFTER it entered the cart, so without this a deactivated product — or one
    // whose category was pulled from sale — would still convert into an order,
    // decrement stock, and trigger a confirmation email. Checkout is where
    // "withdrawn from sale" is finally enforced. The active check runs before the
    // stock check so a withdrawn item reports "no longer available", not a stock
    // figure the shopper can never act on.
    for (const item of cart.items) {
      if (!item.product.isActive || !item.product.category.isActive) {
        throw new BadRequestException(`Product "${item.product.name}" is no longer available`);
      }
      if (item.quantity > item.product.stock) {
        throw new BadRequestException(
          `Insufficient stock for "${item.product.name}" — ${item.product.stock} available`,
        );
      }
    }

    // Compute the Nova Poshta shipping cost when the order carries an NP city
    // ref (TASK-080). A transient courier failure must never block an order, so
    // the fallback to 0 stays — but it is a fallback for a BAD MINUTE, not for a
    // bad deployment (TASK-337).
    let shippingCost: number | undefined;
    const npCityRef = dto.shippingAddress.npCityRef;
    if (npCityRef) {
      try {
        const estimate = await this.deliveryService.estimateShipping(npCityRef);
        shippingCost = Number(estimate.cost);
      } catch (err) {
        // A missing NP_API_KEY is a deployment defect, not a courier hiccup.
        // Swallowing it here would book a 0.00 shipping cost on every real order
        // — the shop paying for delivery out of its own pocket, silently, with
        // nothing in the logs louder than a warning. Let it out.
        if (isDeliveryNotConfiguredError(err)) throw err;
        this.logger.warn({ err, npCityRef }, 'Shipping estimate failed at order creation; using 0');
        shippingCost = 0;
      }
    }

    // ─── TASK-174 add-on block ─────────────────────────────────────────────────
    // Re-resolve every line's applicable add-ons FRESH (one batched call), in the
    // same defensive spirit as the stock re-check above: a selection made at
    // add-to-cart time may since have become inapplicable (the service was
    // deactivated, the category template changed, a REMOVE delta was added, the
    // product was recategorised). Such a selection is silently DROPPED with a
    // warning — never a thrown error that would block an otherwise valid order.
    const addonsByCartItemId = await this.snapshotAddons(cart, userId);
    // ───────────────────────────────────────────────────────────────────────────

    // ─── TASK-079 discount block ───────────────────────────────────────────────
    // Re-validate the promo code authoritatively (never trust a client amount).
    // computeDiscount re-runs every eligibility gate against the cart subtotal
    // and returns the clamped amount; the redeem closure runs the cap re-check +
    // redemption insert inside the order transaction (order.repository), so a
    // cap race rolls the whole order back. Kept as one localized block.
    let discount: CreateOrderParams['discount'];
    if (dto.discountCode) {
      const subtotal = computeSubtotalString(cart.items);
      const { discount: applied, amount } = await this.discountService.computeDiscount(
        dto.discountCode,
        subtotal,
        userId,
      );
      discount = {
        amount,
        code: applied.code,
        redeem: (orderId, tx) => this.discountService.redeem(applied.id, userId, orderId, tx),
      };
    }
    // ───────────────────────────────────────────────────────────────────────────

    const order = await this.orderRepository.createFromCart(
      {
        userId,
        cartId: cart.id,
        cartItems: cart.items,
        addonsByCartItemId,
        shippingAddress: dto.shippingAddress,
        billingAddress: dto.billingAddress,
        notes: dto.notes,
        ...(shippingCost !== undefined ? { shippingCost } : {}),
        ...(discount ? { discount } : {}),
      },
      // ── TASK-103-F: transactional outbox ──────────────────────────────────
      // Enqueue the order-confirmation email INSIDE the order's transaction so
      // the outbox row and the order commit atomically. The background
      // MailOutboxWorker renders + sends it later, so the HTTP response no
      // longer blocks on SMTP and a transient mail failure can never be lost.
      // Runs alongside the TASK-079 discount redeem (same transaction).
      async (tx, created) => {
        await this.mailOutbox.enqueueOrderConfirmation(
          {
            to: user.email,
            order: OrderEntity.fromPrisma(created),
            customerName: user.firstName ?? undefined,
          },
          tx,
        );
      },
    );

    this.logger.info({ event: 'order.created', orderId: order.id, userId }, 'Order created');

    return OrderEntity.fromPrisma(order);
  }

  /**
   * List the calling user's orders (paginated, newest first, optional status
   * filter).
   */
  async getOrders(
    userId: string,
    query: OrderListQueryDto,
  ): Promise<{ data: OrderEntity[]; meta: PaginationMeta }> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const { orders, total } = await this.orderRepository.findByUserId(userId, query);

    return {
      data: orders.map((order) => OrderEntity.fromPrisma(order)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin — list orders across ALL users (paginated, newest first) with
   * optional `userId`, `status`, and created-at date-range filters. No
   * ownership scoping; authorization (ADMIN role) is enforced at the controller.
   */
  async adminGetAllOrders(
    query: AdminOrderListQueryDto,
  ): Promise<{ data: OrderEntity[]; meta: PaginationMeta }> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const { orders, total } = await this.orderRepository.findAll(query);

    return {
      data: orders.map((order) => OrderEntity.fromPrisma(order)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin — get any single order by ID with no ownership check. Authorization
   * (ADMIN role) is enforced at the controller.
   *
   * @throws NotFoundException when the order does not exist.
   */
  async adminGetOrder(orderId: string): Promise<OrderEntity> {
    // Admin read joins the owning user so the response carries customer data
    // (email + name); customer-facing `getOrder` keeps the lean `findById`.
    const order = await this.orderRepository.findByIdForAdmin(orderId);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return OrderEntity.fromPrisma(order);
  }

  /**
   * Get a single order owned by the user.
   *
   * @throws NotFoundException when the order does not exist or belongs to a
   *   different user (never reveal the existence of another user's order).
   */
  async getOrder(userId: string, orderId: string): Promise<OrderEntity> {
    const order = await this.orderRepository.findById(orderId);

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    return OrderEntity.fromPrisma(order);
  }

  /**
   * Cancel a PENDING order owned by the user.
   *
   * @throws NotFoundException when the order does not exist or is not owned.
   * @throws ConflictException when the order is no longer PENDING.
   */
  async cancelOrder(userId: string, orderId: string): Promise<OrderEntity> {
    const order = await this.orderRepository.findById(orderId);

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException('Only PENDING orders can be cancelled');
    }

    // cancelAndRestock flips the order to CANCELLED and returns the reserved
    // stock to inventory atomically (stock was decremented at creation).
    // TASK-251: the customer is the actor for their own self-cancel, so their
    // userId is recorded as the history row's changedBy.
    const cancelled = await this.orderRepository.cancelAndRestock(orderId, userId);

    this.logger.info(
      { event: 'order.cancelled', orderId, userId },
      'Order cancelled; reserved stock released',
    );

    return OrderEntity.fromPrisma(cancelled);
  }

  /**
   * Internal — update an order's status without an ownership check.
   * Used by the payment webhook handler (TASK-034) and admin order management
   * (TASK-041).
   *
   * @throws NotFoundException when the order does not exist (so admin callers
   *   get a clean 404 rather than a Prisma "record not found" 500).
   * @throws ConflictException `ORDER_STALE` when `expectedUpdatedAt` no longer
   *   matches the stored row, and `ORDER_TRANSITION_INVALID` when the state
   *   machine forbids the move.
   *
   * TASK-251: `changedBy` is the acting user's id (the admin, supplied by the
   * controller via `@CurrentUser('id')`) or `null` for system-authored changes
   * (e.g. a future payment webhook). It is threaded, unchanged, into whichever
   * repository branch fires so the audit row records who made the change.
   *
   * TASK-332 adds two gates in front of every branch below, in this order:
   *
   *  1. **Staleness.** When the caller declares which version of the order it was
   *     looking at (`expectedUpdatedAt`), a mismatch is refused. It comes FIRST
   *     because a transition verdict computed against a status the client never
   *     saw would be actively misleading — "cannot move DELIVERED → SHIPPED" when
   *     the operator's screen said PROCESSING explains nothing.
   *  2. **Transition validity.** The move is checked against
   *     {@link canTransition}, and a refusal happens BEFORE any write — so no
   *     OrderStatusHistory row is appended for a change that never took effect.
   *     That is the whole point: history is evidence, and a rejected request is
   *     not an event.
   *
   * `expectedUpdatedAt` is optional so system callers with no stale UI to guard
   * against — the payment callback, the reconcile worker — are not forced to
   * invent one.
   */
  async updateStatus(
    orderId: string,
    status: OrderStatus,
    changedBy: string | null,
    options: { expectedUpdatedAt?: Date } = {},
  ): Promise<OrderEntity> {
    const existing = await this.orderRepository.findById(orderId);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    this.assertFresh(existing, options.expectedUpdatedAt);

    if (!canTransition(existing.status, status)) {
      this.logger.warn(
        {
          event: 'order.transition_rejected',
          orderId,
          from: existing.status,
          to: status,
          changedBy,
        },
        'Rejected a status transition the state machine forbids',
      );
      throw invalidTransitionError(existing.status, status);
    }

    // TASK-228: reviving an order whose cancellation already credited its stock
    // back (restockedAt set) into a live status must re-reserve that stock, or
    // a later re-cancel would credit it a second time. Moving between the
    // terminal statuses (CANCELLED ↔ REFUNDED) keeps the flag and touches
    // nothing. The repository re-reserves with the same conditional-decrement
    // guard as order creation, so an impossible revive gets a 409 and the
    // order keeps its terminal status.
    // `!= null` (not `!== null`): only an actual restock timestamp marks the
    // order as needing a re-reserve — fixtures/rows without the field must
    // behave like unflagged orders.
    const isRevive =
      existing.restockedAt != null &&
      status !== OrderStatus.CANCELLED &&
      status !== OrderStatus.REFUNDED;
    if (isRevive) {
      const revived = await this.orderRepository.reviveAndReserve(
        orderId,
        status,
        existing.paymentStatus,
        changedBy,
        { expectedUpdatedAt: options.expectedUpdatedAt },
      );
      this.logger.info(
        { event: 'order.revived_reserved', orderId, from: existing.status, to: status },
        'Cancelled order revived; stock re-reserved',
      );
      return OrderEntity.fromPrisma(revived);
    }

    // Pre-shipment cancellation: return the reserved stock to inventory and
    // evict product caches in one transaction (reuses the customer-cancel path).
    // Post-shipment cancels and refunds are deliberately NOT auto-restocked —
    // the physical return must be received and re-stocked by hand (TASK-124).
    // The restockedAt guard is belt-and-braces: a live pre-shipment order never
    // has it set (revive clears it), so it only blocks double credits if a
    // status was edited outside the service.
    if (shouldAutoRestock(existing.status, status) && existing.restockedAt === null) {
      const restocked = await this.orderRepository.cancelAndRestock(orderId, changedBy, {
        expectedUpdatedAt: options.expectedUpdatedAt,
      });
      this.logger.info(
        { event: 'order.cancelled_restocked', orderId, from: existing.status },
        'Order cancelled before shipment; reserved stock returned to inventory',
      );
      return OrderEntity.fromPrisma(restocked);
    }

    // TASK-151: order status and payment status are decoupled. Advancing the
    // order status leaves the existing payment status untouched (forwarded
    // unchanged); the admin manages payment independently via
    // adminUpdatePaymentStatus. (Previously TASK-123 auto-derived PAID here.)
    //
    // TASK-254: a plain transition that crosses the pre-shipment boundary
    // (e.g. PROCESSING→SHIPPED, CONFIRMED→DELIVERED, or CANCELLED→PROCESSING)
    // changes each line-item product's DERIVED reservedQty/physicalQty without
    // touching `stock` — so the cached admin `ProductEntity` (findById) must be
    // evicted, exactly as the restock/revive paths already do. A transition that
    // stays on the same side (PENDING→CONFIRMED, SHIPPED→DELIVERED) leaves
    // reserved membership unchanged and needs no eviction.
    const crossesPreShipmentBoundary =
      PRE_SHIPMENT_STATUSES.has(existing.status) !== PRE_SHIPMENT_STATUSES.has(status);
    const order = await this.orderRepository.updateStatus(
      orderId,
      existing.status,
      status,
      existing.paymentStatus,
      changedBy,
      {
        evictProductStockCaches: crossesPreShipmentBoundary,
        expectedUpdatedAt: options.expectedUpdatedAt,
      },
    );
    return OrderEntity.fromPrisma(order);
  }

  /**
   * Admin — which statuses this order may move to right now (TASK-332).
   *
   * Exists so the admin panel offers exactly the legal targets. Before this, the
   * UI offered "every status except the current one" and the operator learned the
   * truth from a failed request — which is the worst possible moment to learn it,
   * because by then they have already decided.
   *
   * `updatedAt` travels with the answer deliberately: it is the version token the
   * client hands back on the subsequent PATCH, so the whole read-decide-write
   * cycle is guarded by one round trip rather than two.
   *
   * @throws NotFoundException when the order does not exist or is soft-deleted.
   */
  async getAllowedTransitions(
    orderId: string,
  ): Promise<{ current: OrderStatus; allowed: OrderStatus[]; updatedAt: Date }> {
    const existing = await this.orderRepository.findById(orderId);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    return {
      current: existing.status,
      allowed: allowedTransitions(existing.status),
      updatedAt: existing.updatedAt,
    };
  }

  /**
   * Refuse the write when the caller was looking at an older version of the order
   * (edge case E-11: two admins with the same order open).
   *
   * A no-op when the caller did not declare a version — system callers (payment
   * callback, reconcile worker) have no stale screen to protect, and forcing them
   * to invent a timestamp would only add a way to get it wrong.
   *
   * This is the FAST check, not the only one: it closes the human-scale window
   * (minutes between loading a page and clicking) but not the millisecond one, so
   * the same `expectedUpdatedAt` is threaded down into the repository, where the
   * conditional write is the actual arbiter under concurrency.
   */
  private assertFresh(existing: { updatedAt: Date }, expectedUpdatedAt?: Date): void {
    if (!expectedUpdatedAt) return;
    if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw staleOrderError();
    }
  }

  /**
   * Admin — set an order's payment status directly, independently of its order
   * status (TASK-151). This is the manual stand-in for the Stripe payment
   * webhook (TASK-034) and the supported way to mark an order paid/unpaid/
   * refunded. Authorization (ADMIN role) is enforced at the controller.
   *
   * @throws NotFoundException when the order does not exist.
   */
  async adminUpdatePaymentStatus(
    orderId: string,
    paymentStatus: PaymentStatus,
    changedBy: string | null,
  ): Promise<OrderEntity> {
    const existing = await this.orderRepository.findById(orderId);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    const order = await this.orderRepository.updatePaymentStatus(orderId, paymentStatus, changedBy);

    this.logger.info(
      { event: 'order.payment_status_updated', orderId, paymentStatus },
      'Order payment status updated',
    );

    return OrderEntity.fromPrisma(order);
  }

  /**
   * Apply a translated payment-provider event to an order (TASK-330).
   *
   * ── SEAM DECLARED AHEAD OF THE IMPLEMENTATION (plan 167, Фаза 0) ─────────────
   * This method is the ONE door through which the payment module moves an order.
   * It is declared here, before either side is written, so the payments branch can
   * call it while the orders branch fills it in, and neither has to guess the
   * other's shape. Filling it in is TASK-330-A / TASK-332 work.
   *
   * Three rules the implementation must honour, all of them learned the hard way
   * and all of them recorded in docs/payments-liqpay.md:
   *
   *  1. **Idempotency belongs to the database.** The caller has already inserted a
   *     PaymentEvent row; the unique constraint on
   *     (paymentId, providerStatus, providerPaymentId) is what makes a repeated
   *     callback a no-op. Never re-derive "have I seen this?" with an `if` — two
   *     concurrent callbacks pass the same `if`.
   *  2. **Verify the money before believing it.** Compare the event's amount and
   *     currency against what the Payment row was created with. A mismatch is
   *     rejected, not applied: otherwise a tampered amount is accepted in full.
   *  3. **Everything flows through the state machine.** Payment status, order
   *     status, `paidAt`, clearing `reservationExpiresAt` and the OrderStatusHistory
   *     row (with `changedBy: null` — a callback has no acting user) all happen in
   *     ONE transaction. A partial application is how stock, money and history
   *     drift apart.
   *
   * Returns `applied: false` for a duplicate or a non-actionable event (a provider
   * reporting work still in progress); the caller answers 200 either way, because
   * a provider that does not get a 200 will simply retry forever.
   *
   * ── HOW THE THREE RULES ARE HONOURED (TASK-332 implementation) ───────────────
   *
   *  1. *Idempotency.* Nothing here asks "have I seen this event?" — by the time
   *     we are called, the caller's PaymentEvent insert has already survived the
   *     unique constraint, which is the only trustworthy answer. What this method
   *     does add is idempotency of MEANING: a second SUCCEEDED for an order that
   *     is already PAID changes nothing and reports `applied: false`. Those are
   *     different questions, and the second one cannot be delegated to an index.
   *  2. *Verify the money.* {@link assertAmountMatches} compares the reported
   *     amount and currency against what the Payment row was created with, in
   *     integer cents. A mismatch THROWS rather than returning `applied: false`:
   *     a tampered amount is not a no-op event, it is an attack, and swallowing
   *     it quietly is how it goes unnoticed.
   *  3. *One transaction.* The service decides; `applyPaymentOutcome` writes. Every
   *     column and every history row moves together or not at all.
   *
   * The state machine is consulted, never bypassed: when a payment succeeds on an
   * order the operator has already advanced to PROCESSING, the money is recorded
   * and the STATUS is left alone, because PROCESSING → CONFIRMED is not a legal
   * move. Before the state machine existed, that same callback would have dragged
   * the order backwards.
   *
   * @throws NotFoundException when the payment or its order does not exist.
   * @throws BadRequestException when the reported amount/currency does not match
   *   what was charged.
   */
  async applyPaymentEvent(event: PaymentEventInput): Promise<PaymentApplyResult> {
    const payment = await this.orderRepository.findPaymentWithOrder(event.paymentId);

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const { order } = payment;
    this.assertAmountMatches(payment, event);

    const plan = this.planPaymentApplication(payment, event);

    if (!plan) {
      this.logger.info(
        {
          event: 'order.payment_event_ignored',
          orderId: order.id,
          paymentId: payment.id,
          outcome: event.outcome,
          providerStatus: event.providerStatus,
        },
        'Payment event recorded but not actionable',
      );
      return { applied: false, orderId: order.id };
    }

    await this.orderRepository.applyPaymentOutcome(plan);

    this.logger.info(
      {
        event: 'order.payment_event_applied',
        orderId: order.id,
        paymentId: payment.id,
        outcome: event.outcome,
        providerStatus: event.providerStatus,
        paymentStatus: plan.paymentStatusChange?.to,
        status: plan.statusChange?.to,
      },
      'Payment event applied to order',
    );

    return { applied: true, orderId: order.id };
  }

  /**
   * Refuse an event whose money does not match what was charged.
   *
   * Compared in integer cents because the provider's "100.0" and our "100.00" are
   * the same money and a string compare says otherwise; currency case-insensitively
   * for the same reason. Both sides of the comparison are frozen values — the
   * Payment row's amount was written when we created the attempt, before the
   * customer ever reached the provider — so this is a genuine check and not a
   * comparison of the callback against itself.
   */
  private assertAmountMatches(payment: PaymentWithOrderRow, event: PaymentEventInput): void {
    const expectedCents = toCents(payment.amount.toString());
    const reportedCents = toCents(event.amount);
    const currencyMatches = payment.currency.toUpperCase() === event.currency.toUpperCase();

    if (expectedCents === reportedCents && currencyMatches) {
      return;
    }

    this.logger.error(
      {
        event: 'order.payment_event_amount_mismatch',
        paymentId: payment.id,
        orderId: payment.orderId,
        expected: `${payment.amount.toString()} ${payment.currency}`,
        reported: `${event.amount} ${event.currency}`,
        providerStatus: event.providerStatus,
      },
      'Rejected a payment event whose amount or currency does not match the charge',
    );

    throw new BadRequestException('Payment amount or currency does not match the charge');
  }

  /**
   * Turn a translated provider event into the write plan — or `null` when there is
   * nothing to do.
   *
   * All the business judgement of the payment path lives in this one pure-ish
   * function, so the rules can be read in one screen rather than reconstructed
   * from a transaction body:
   *
   * - **SUCCEEDED** marks the money ours, stamps `paidAt`, lifts the reservation
   *   deadline, and moves a still-PENDING order to CONFIRMED. Already PAID → null.
   * - **FAILED** records the failed attempt and marks the order's payment FAILED,
   *   but only while it is still unpaid: a late failure callback for a superseded
   *   attempt must never un-pay a paid order. The order itself is NOT cancelled —
   *   the customer may retry, and the reservation worker owns the deadline.
   * - **REFUNDED** moves the order's payment to REFUNDED and, where the state
   *   machine permits, the order to REFUNDED. Stock is deliberately NOT credited
   *   back: the goods have to physically return first (TASK-124's rule, unchanged).
   * - **IGNORED** — "still processing" — changes nothing. There is no PENDING
   *   outcome for exactly this reason: treating "not finished yet" as an event to
   *   act on is how an order flips to paid before the money exists.
   */
  private planPaymentApplication(
    payment: PaymentWithOrderRow,
    event: PaymentEventInput,
  ): PaymentApplyPlan | null {
    const { order } = payment;
    const now = new Date();
    const base = {
      paymentId: payment.id,
      orderId: order.id,
      ...(event.providerPaymentId ? { providerPaymentId: event.providerPaymentId } : {}),
    };

    switch (event.outcome) {
      case PaymentOutcome.SUCCEEDED: {
        if (order.paymentStatus === PaymentStatus.PAID) return null;
        return {
          ...base,
          attemptStatus: PaymentAttemptStatus.SUCCEEDED,
          settledAt: now,
          failureCode: null,
          failureMessage: null,
          paymentStatusChange: { from: order.paymentStatus, to: PaymentStatus.PAID },
          paidAt: order.paidAt ?? now,
          clearReservation: true,
          ...(canTransition(order.status, OrderStatus.CONFIRMED)
            ? { statusChange: { from: order.status, to: OrderStatus.CONFIRMED } }
            : {}),
        };
      }

      case PaymentOutcome.FAILED: {
        // An attempt that failed is worth recording even on a paid order (the
        // customer's second card may have been declined before the third worked),
        // but it must not touch the order's payment status.
        const alreadySettled =
          order.paymentStatus === PaymentStatus.PAID ||
          order.paymentStatus === PaymentStatus.REFUNDED;
        if (payment.status === PaymentAttemptStatus.FAILED && alreadySettled) return null;
        return {
          ...base,
          attemptStatus: PaymentAttemptStatus.FAILED,
          ...(event.failureCode !== undefined ? { failureCode: event.failureCode } : {}),
          ...(event.failureMessage !== undefined ? { failureMessage: event.failureMessage } : {}),
          ...(alreadySettled
            ? {}
            : {
                paymentStatusChange: { from: order.paymentStatus, to: PaymentStatus.FAILED },
              }),
        };
      }

      case PaymentOutcome.REFUNDED: {
        if (order.paymentStatus === PaymentStatus.REFUNDED) return null;
        return {
          ...base,
          attemptStatus: PaymentAttemptStatus.REFUNDED,
          settledAt: now,
          paymentStatusChange: { from: order.paymentStatus, to: PaymentStatus.REFUNDED },
          ...(canTransition(order.status, OrderStatus.REFUNDED)
            ? { statusChange: { from: order.status, to: OrderStatus.REFUNDED } }
            : {}),
        };
      }

      case PaymentOutcome.IGNORED:
      default:
        return null;
    }
  }

  /**
   * Admin — read an order's full status/payment-status timeline (TASK-251),
   * oldest-first. Mirrors {@link adminGetOrder}'s existence check so a missing
   * or soft-deleted order 404s cleanly rather than returning an empty list.
   *
   * @throws NotFoundException when the order does not exist or is soft-deleted.
   */
  async getOrderHistory(orderId: string): Promise<OrderStatusHistoryEntity[]> {
    const existing = await this.orderRepository.findById(orderId);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    const rows = await this.orderRepository.findHistoryByOrderId(orderId);
    return rows.map((row) => OrderStatusHistoryEntity.fromPrisma(row));
  }

  /**
   * Freeze each cart line's SELECTED add-ons into order-ready snapshots
   * (TASK-174), keyed by cart-item id.
   *
   * The applicable set is re-resolved fresh here rather than trusted from the
   * customer's last `GET /cart` — the same reason stock and the discount are
   * re-validated at order-creation time. A selection the resolver no longer
   * returns (deactivated service, edited template, new REMOVE delta) is dropped
   * with a warning and simply not charged; it never throws, because a stale
   * add-on must not block an otherwise valid order.
   *
   * The effective price the resolver returns — catalog, ADD, or OVERRIDE — is
   * what gets frozen, so a later reprice or template edit can never rewrite the
   * order's history.
   */
  private async snapshotAddons(
    cart: CartWithItems,
    userId: string,
  ): Promise<Map<string, OrderAddonSnapshot[]>> {
    const resolved = await this.addonResolver.resolveForProducts(
      cart.items.map((item) => ({ id: item.product.id, categoryId: item.product.categoryId })),
    );

    const snapshots = new Map<string, OrderAddonSnapshot[]>();

    for (const item of cart.items) {
      const available = resolved.get(item.product.id) ?? [];
      const byId = new Map(available.map((addon) => [addon.addonServiceId, addon]));

      const lineSnapshots: OrderAddonSnapshot[] = [];
      for (const selection of item.addons ?? []) {
        const addon = byId.get(selection.addonServiceId);

        if (!addon) {
          this.logger.warn(
            {
              userId,
              cartItemId: item.id,
              productId: item.productId,
              addonServiceId: selection.addonServiceId,
            },
            'Selected add-on is no longer applicable at order creation; dropping it from the order',
          );
          continue;
        }

        lineSnapshots.push({
          addonServiceId: addon.addonServiceId,
          name: addon.name,
          price: addon.price,
        });
      }

      if (lineSnapshots.length > 0) {
        snapshots.set(item.id, lineSnapshots);
      }
    }

    return snapshots;
  }
}

/**
 * Class name of the delivery module's "Nova Poshta was never configured" error.
 * Declared as a string here — see {@link isDeliveryNotConfiguredError}.
 */
const DELIVERY_NOT_CONFIGURED = 'DeliveryNotConfiguredException';

/**
 * Whether a failed shipping estimate means "not configured" rather than "Nova
 * Poshta had a bad minute" (TASK-337, WT-D seam).
 *
 * ── INTEGRATION NOTE (orchestrator, plan 167) ───────────────────────────────
 * WT-D exports the canonical predicate for this. Once that branch is merged,
 * DELETE this function and use it directly:
 *
 *     import { isDeliveryNotConfigured } from '../delivery';
 *     if (isDeliveryNotConfigured(err)) throw err;
 *
 * It is duplicated by NAME here, and never as a copy of WT-D's exception class,
 * because two competing definitions of the same failure is exactly the bug that
 * would outlive this comment. The name check is deliberately belt-and-braces:
 * `err.name` covers classes extending `HttpException` (which assigns
 * `this.name = this.constructor.name`), and `err.constructor.name` covers a class
 * extending plain `Error`, so it holds whichever base WT-D chose.
 */
function isDeliveryNotConfiguredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === DELIVERY_NOT_CONFIGURED || err.constructor?.name === DELIVERY_NOT_CONFIGURED;
}

/**
 * Parse a decimal money string into integer cents.
 *
 * Used to compare a provider's reported amount against the frozen charge. "100.0"
 * and "100.00" are the same money; a string comparison disagrees, and a float
 * comparison disagrees intermittently, which is worse.
 */
function toCents(value: string): number {
  return Math.round(parseFloat(value) * 100);
}

/**
 * Compute the cart subtotal as a "XX.YY" decimal string using integer-cents
 * arithmetic (mirrors CartEntity/order line-total math). Feeds the authoritative
 * discount recomputation in {@link OrderService.createOrder}.
 */
function computeSubtotalString(items: CartWithItems['items']): string {
  const subtotalCents = items.reduce(
    (cents, item) =>
      cents + Math.round(parseFloat(item.product.price.toString()) * 100) * item.quantity,
    0,
  );
  const dollars = Math.floor(subtotalCents / 100);
  const remainder = subtotalCents % 100;
  return `${dollars}.${remainder.toString().padStart(2, '0')}`;
}
