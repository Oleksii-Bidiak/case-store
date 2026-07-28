import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { createHash, randomBytes } from 'crypto';
import { OrderStatus, PaymentStatus, PaymentAttemptStatus, PaymentMethod } from '@prisma/client';
import { OrderRepository } from './order.repository';
import { CartRepository, type CartWithItems } from '../cart/cart.repository';
import { UserRepository } from '../user/user.repository';
import { MailOutboxService } from '../mail-outbox';
import { DeliveryService, isDeliveryNotConfigured } from '../delivery';
import { DiscountService } from '../discount';
import { OrderEntity, OrderStatusHistoryEntity } from './entities';
import { PRE_SHIPMENT_STATUSES } from './order.constants';
import { allowedTransitions, canTransition } from './order-state-machine';
import { invalidTransitionError, staleOrderError } from './order.errors';
import { AddonApplicabilityResolver } from '../addon-service';
import type {
  CreateOrderDto,
  CreateManualOrderDto,
  OrderListQueryDto,
  AdminOrderListQueryDto,
  AddressDto,
} from './dto';
import type {
  CreateOrderParams,
  OrderActor,
  OrderAddonSnapshot,
  OrderWithItems,
  PaymentApplyPlan,
  PaymentWithOrderRow,
} from './order.types';
import type { PaymentApplyResult, PaymentEventInput } from '../payment/payment.types';
import { PaymentOutcome } from '../payment/payment.types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

/**
 * How long a guest's order-status link stays usable when
 * `GUEST_ORDER_TOKEN_TTL_DAYS` is unset (TASK-338). Two months: long enough to
 * cover a delivery, a return window and a forgotten inbox, short enough that a
 * leaked old email is not a permanent key.
 */
const DEFAULT_GUEST_TOKEN_TTL_DAYS = 60;

/** Fallback reservation window for unpaid card orders (owner decision 2026-07-28). */
const DEFAULT_RESERVATION_TTL_MINUTES = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Bytes of entropy in a guest order-access token. */
const GUEST_TOKEN_BYTES = 32;

/**
 * Mint a guest's order-access token (TASK-338).
 *
 * 32 random bytes, hex — the same strength as the refresh and password-reset
 * tokens, because it grants the same kind of thing: access to one person's data
 * with no password in front of it. `randomUUID` would have been shorter to write
 * and materially weaker (122 bits, structured).
 */
function generateGuestToken(): string {
  return randomBytes(GUEST_TOKEN_BYTES).toString('hex');
}

/**
 * SHA-256 of a guest token — what actually goes in the database.
 *
 * Identical to `auth.repository.ts`'s `hashToken`, and deliberately so: the raw
 * token exists only in the outgoing email and the incoming request, so a dump of
 * the orders table hands out nothing. Not salted/slow-hashed on purpose — this
 * is a 256-bit random value, not a password, so there is nothing to brute-force
 * and a per-request Argon2 on a public GET would be a denial-of-service lever.
 */
function hashGuestToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

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
    // TASK-338: reads GUEST_ORDER_TOKEN_TTL_DAYS — how long a guest's emailed
    // status link stays usable.
    private readonly configService: ConfigService,
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
  async createOrder(actor: OrderActor, dto: CreateOrderDto): Promise<OrderEntity> {
    // ─── TASK-338: resolve who is buying, and from which cart ──────────────────
    // The two arms differ in exactly three things — the ban check, which cart to
    // load, and where the confirmation email is addressed. Everything after this
    // block (stock re-validation, add-ons, discounts, the transaction) is shared,
    // because a guest order is a real order in every other respect.
    const userId = actor.type === 'user' ? actor.userId : null;

    // Ban enforcement (TASK-150): a deactivated account must not place an order
    // even while it still holds a non-expired access token. Refresh tokens are
    // revoked the moment a user is banned, but the short-lived access token
    // remains valid until it expires — so re-check active status here, as the
    // first operation, before any cart lookup or inventory write. The same user
    // object is reused for the confirmation email below (single fetch).
    // A guest has no account to deactivate, so this gate simply does not apply.
    let user: Awaited<ReturnType<UserRepository['findById']>> = null;
    if (actor.type === 'user') {
      user = await this.userRepository.findById(actor.userId);
      if (!user || !user.isActive) {
        throw new ForbiddenException('Account is deactivated');
      }
    }

    const cart =
      actor.type === 'user'
        ? await this.cartRepository.findByUserId(actor.userId)
        : await this.cartRepository.findByToken(actor.cartToken);

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
    // Absent means cash on delivery — the honest reading of a request that never
    // mentions payment, and what every pre-TASK-330 order actually was.
    const paymentMethod = dto.paymentMethod ?? PaymentMethod.ON_DELIVERY;

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
        if (isDeliveryNotConfigured(err)) throw err;
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
      // TASK-338 limitation, stated out loud rather than discovered as a 500:
      // `DiscountRedemption.userId` is a NOT NULL foreign key to User, and both
      // the per-user cap and the redemption insert are built on it. Letting a
      // guest through here would either crash inside the order transaction or
      // require dropping the per-user cap — so guests are told plainly that the
      // code needs an account. Lifting this is a schema change, not a patch.
      if (actor.type === 'guest') {
        throw new BadRequestException(
          'Promo codes require an account — sign in or register to use this code',
        );
      }
      const subtotal = computeSubtotalString(cart.items);
      const { discount: applied, amount } = await this.discountService.computeDiscount(
        dto.discountCode,
        subtotal,
        actor.userId,
      );
      discount = {
        amount,
        code: applied.code,
        redeem: (orderId, tx) => this.discountService.redeem(applied.id, actor.userId, orderId, tx),
      };
    }
    // ───────────────────────────────────────────────────────────────────────────

    // ─── TASK-338: the guest's key to their own order ──────────────────────────
    // Generated here so the RAW value exists only in this function and the
    // outgoing email; only its SHA-256 is ever persisted (same at-rest pattern as
    // RefreshToken / PasswordResetToken). Without it a guest is blind the moment
    // the cart cookie is gone or they switch device — edge case E-17.
    const guestToken = actor.type === 'guest' ? generateGuestToken() : null;
    const guestStatusUrl = guestToken ? this.buildGuestStatusUrl(guestToken) : null;

    // Where the confirmation letter goes. For a guest there is no user row, so it
    // comes from what they typed at checkout — which is also why the email is the
    // only proof we have that the address is theirs.
    const recipient =
      actor.type === 'guest'
        ? { email: actor.contact.email, name: actor.contact.name }
        : { email: user!.email, name: user!.firstName ?? undefined };

    const order = await this.orderRepository.createFromCart(
      {
        userId,
        ...(actor.type === 'guest' && guestToken
          ? {
              guest: {
                email: actor.contact.email,
                phone: actor.contact.phone,
                name: actor.contact.name,
                accessTokenHash: hashGuestToken(guestToken),
              },
            }
          : {}),
        cartId: cart.id,
        cartItems: cart.items,
        addonsByCartItemId,
        shippingAddress: dto.shippingAddress,
        billingAddress: dto.billingAddress,
        notes: dto.notes,
        // ─── TASK-330: the payment method and its consequence ──────────────────
        // Both were missing, and their absence was invisible. `paymentMethod`
        // defaulted to ON_DELIVERY for every order including card payments, and
        // because `findExpiredReservations` requires BOTH an ONLINE/INSTALLMENTS
        // method AND a non-null deadline, the auto-cancel worker could never match
        // a row. It ran every minute, found nothing, logged nothing, and stock held
        // by abandoned card payments was never returned.
        paymentMethod,
        reservationExpiresAt: this.resolveReservationDeadline(paymentMethod),
        ...(shippingCost !== undefined ? { shippingCost } : {}),
        ...(discount ? { discount } : {}),
      },
      // ── TASK-103-F: transactional outbox ──────────────────────────────────
      // Enqueue the order-confirmation email INSIDE the order's transaction so
      // the outbox row and the order commit atomically. The background
      // MailOutboxWorker renders + sends it later, so the HTTP response no
      // longer blocks on SMTP and a transient mail failure can never be lost.
      // Runs alongside the TASK-079 discount redeem (same transaction).
      //
      // TASK-338: the recipient comes from the ORDER, never from a user row —
      // for a guest there is no user row to read. The guest's raw status-link
      // token travels with the payload and is written into the letter; it is the
      // one and only time it leaves this process.
      async (tx, created) => {
        await this.mailOutbox.enqueueOrderConfirmation(
          {
            to: recipient.email,
            order: OrderEntity.fromPrisma(created),
            customerName: recipient.name,
            ...(guestStatusUrl ? { orderStatusUrl: guestStatusUrl } : {}),
          },
          tx,
        );
      },
    );

    this.logger.info(
      {
        event: 'order.created',
        orderId: order.id,
        userId,
        // Never the raw token, and never the guest's email — both are redacted
        // from logs elsewhere and would defeat the point of hashing at rest.
        guest: actor.type === 'guest',
      },
      'Order created',
    );

    return OrderEntity.fromPrisma(order);
  }

  /**
   * Build the absolute storefront link a guest opens to see their order
   * (TASK-338).
   *
   * `STORE_CLIENT_URL` is read WITHOUT a fallback on purpose. Giving it a
   * `http://localhost:3000` default is precisely the bug this codebase already
   * paid for once (see the note at the top of `scripts/env-check.js`): the value
   * silently works in dev and silently points production customers at their own
   * laptop. Environment validation makes the variable mandatory in production, so
   * the only case reaching the `null` branch is a dev box — where a warning and
   * no button is the honest outcome.
   */
  private buildGuestStatusUrl(rawToken: string): string | null {
    const storeUrl = this.configService.get<string>('STORE_CLIENT_URL');

    if (!storeUrl) {
      this.logger.warn(
        { event: 'order.guest_status_url_unavailable' },
        'STORE_CLIENT_URL is not set — the guest confirmation email will carry no status link',
      );
      return null;
    }

    return `${storeUrl.replace(/\/+$/, '')}/orders/guest/${rawToken}`;
  }

  /**
   * Read a guest's own order using the token from their confirmation email
   * (TASK-338).
   *
   * The ONLY way a guest reaches their order once the cart cookie is gone or they
   * switch device (edge case E-17). The raw token is hashed before the lookup, so
   * a database leak does not hand out order access.
   *
   * The link expires `GUEST_ORDER_TOKEN_TTL_DAYS` after the order was placed.
   * There is no expiry COLUMN — `createdAt` plus the configured window is the
   * same information, and inventing a column that must be kept in step with a
   * setting is how the two drift apart.
   *
   * Every failure — unknown token, expired token, soft-deleted order — answers
   * the same 404. A token that is merely expired must not be distinguishable
   * from one that was never valid, or the endpoint becomes an oracle for
   * guessing tokens.
   */
  async getGuestOrder(rawToken: string): Promise<OrderEntity> {
    const order = await this.orderRepository.findByAccessTokenHash(hashGuestToken(rawToken));

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const ttlDays = this.configService.get<number>(
      'GUEST_ORDER_TOKEN_TTL_DAYS',
      DEFAULT_GUEST_TOKEN_TTL_DAYS,
    );
    const expiresAt = order.createdAt.getTime() + ttlDays * MS_PER_DAY;
    if (Date.now() > expiresAt) {
      this.logger.info(
        { event: 'order.guest_token_expired', orderId: order.id },
        'Guest order link used after it expired',
      );
      throw new NotFoundException('Order not found');
    }

    return OrderEntity.fromPrisma(order);
  }

  /**
   * Attach a new account's earlier guest orders to it (TASK-338).
   *
   * Called after a registration whose email matches orders placed as a guest, so
   * the shopper's history is not split in two by the act of signing up. The guest
   * columns are deliberately kept: they record what was actually typed at
   * checkout, and the emailed status link goes on working.
   *
   * Safe to call for any registration — an email with no guest orders behind it
   * simply claims zero.
   *
   * ── STILL UNWIRED AFTER INTEGRATION, AND ON PURPOSE (plan 167, TASK-353) ────
   * The obvious call site is the successful-registration path in
   * `auth/auth.service.ts`. Injecting OrderService there does NOT work: the
   * module graph already runs AuthModule → … and OrderModule → UserModule →
   * AuthModule, so the import closes a cycle. `forwardRef` would compile and
   * would be a poor trade — a boot-order hazard bolted on during a merge, in the
   * one place where failure means the API does not start at all.
   *
   * Two designs survive review; neither should be chosen in a hurry:
   *  (a) claim lazily from the ORDER side — `getOrders` claims before listing.
   *      No new module edge at all (OrderService already injects UserRepository
   *      for the ban check), idempotent, and it fires exactly when it matters:
   *      the moment the shopper looks for their history. Cost: a write on a read
   *      path.
   *  (b) break the User → Auth edge so the honest dependency direction becomes
   *      available. Correct, larger, and out of scope for this wave.
   *
   * Nothing is lost meanwhile: a guest who registers still reaches every order
   * through the link emailed at checkout. The orders are simply not yet listed
   * under the new account. The capability and its tests ship here so whichever
   * design wins is a wiring change, not a rewrite.
   */
  async claimGuestOrders(userId: string, email: string): Promise<number> {
    const claimed = await this.orderRepository.claimGuestOrders(userId, email.trim().toLowerCase());

    if (claimed > 0) {
      this.logger.info(
        { event: 'order.guest_orders_claimed', userId, claimed },
        `Attached ${claimed} guest order(s) to the new account`,
      );
    }

    return claimed;
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
      // TASK-336: admin reads opt into the operator-only fields.
      data: orders.map((order) => OrderEntity.fromPrisma(order, { includeInternal: true })),
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

    // TASK-336: the admin card is the one place internalNotes belongs.
    return OrderEntity.fromPrisma(order, { includeInternal: true });
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

    // TASK-335: the parcel has left the warehouse — tell the customer, with the
    // waybill if the operator has already entered one. If they enter it later,
    // adminUpdateDetails sends the follow-up.
    if (status === OrderStatus.SHIPPED) {
      await this.notifyShipped(order);
    }

    return OrderEntity.fromPrisma(order);
  }

  /**
   * Admin — update the operator-editable fields that are not part of the order's
   * lifecycle: the Nova Poshta waybill and the internal notes
   * (TASK-335 / TASK-336).
   *
   * Deliberately separate from {@link updateStatus}. A waybill number and a status
   * change are different decisions with different consequences — one of them
   * emails the customer — and merging them would make "fix a typo in the ТТН"
   * capable of moving the order.
   *
   * @throws NotFoundException when the order does not exist.
   * @throws ConflictException `ORDER_STALE` on a concurrent edit.
   */
  async adminUpdateDetails(
    orderId: string,
    fields: { trackingNumber?: string | null; internalNotes?: string | null },
    options: { expectedUpdatedAt?: Date } = {},
  ): Promise<OrderEntity> {
    const existing = await this.orderRepository.findById(orderId);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    this.assertFresh(existing, options.expectedUpdatedAt);

    // A waybill appearing on an order that ALREADY shipped is the second half of
    // the common workflow: the operator marks the parcel gone, then the courier
    // hands over the number. The customer was told "on its way" without a number,
    // so tell them the number now. Only null → value triggers it; correcting a
    // typo does not re-notify, and neither does clearing the field.
    const gainedTracking =
      fields.trackingNumber !== undefined &&
      fields.trackingNumber !== null &&
      !existing.trackingNumber;

    const order = await this.orderRepository.updateDetails(orderId, fields, options);

    if (gainedTracking && order.status === OrderStatus.SHIPPED) {
      await this.notifyShipped(order);
    }

    this.logger.info(
      {
        event: 'order.details_updated',
        orderId,
        // Never the note text itself — it is operator-private by definition.
        fields: Object.keys(fields),
      },
      'Order details updated',
    );

    return OrderEntity.fromPrisma(order, { includeInternal: true });
  }

  /**
   * Admin — create an order on the customer's behalf: a phone order (TASK-341).
   *
   * Prices come from the live catalogue, never from the request. An
   * operator-created order is still a sale at the shop's price, and accepting a
   * price from the admin panel would make every discount a matter of whoever is
   * on the phone, with nothing in the record to say one was given.
   *
   * The same three gates as a self-service checkout apply, for the same reasons:
   * the product must still be on sale, its category must still be on sale, and
   * there must be stock. An operator is not a reason to oversell.
   *
   * @throws BadRequestException when neither an account nor contact details were
   *   given, a product is unknown or withdrawn, or stock is short.
   * @throws ForbiddenException when the named account is deactivated.
   */
  async adminCreateOrder(dto: CreateManualOrderDto, adminUserId: string): Promise<OrderEntity> {
    if (!dto.userId && !dto.contact) {
      throw new BadRequestException(
        'Either an existing customer or contact details are required — an order nobody can be reached about is not a sale',
      );
    }

    if (dto.userId) {
      const user = await this.userRepository.findById(dto.userId);
      if (!user) {
        throw new BadRequestException('That customer account does not exist');
      }
      if (!user.isActive) {
        throw new ForbiddenException('That customer account is deactivated');
      }
    }

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.orderRepository.findOrderableProducts(productIds);
    const byId = new Map(products.map((product) => [product.id, product]));

    const items = dto.items.map((line) => {
      const product = byId.get(line.productId);

      if (!product) {
        throw new BadRequestException('One of the selected products no longer exists');
      }
      if (!product.isActive || !product.category.isActive) {
        throw new BadRequestException(`Product "${product.name}" is no longer available`);
      }
      if (line.quantity > product.stock) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}" — ${product.stock} available`,
        );
      }

      return {
        productId: line.productId,
        quantity: line.quantity,
        price: product.price.toString(),
        name: product.name,
      };
    });

    const order = await this.orderRepository.createManual(
      {
        userId: dto.userId ?? null,
        ...(dto.contact ? { guest: dto.contact } : {}),
        items,
        shippingAddress: dto.shippingAddress,
        ...(dto.notes ? { notes: dto.notes } : {}),
        ...(dto.internalNotes ? { internalNotes: dto.internalNotes } : {}),
        ...(dto.paymentMethod ? { paymentMethod: dto.paymentMethod } : {}),
        // An operator can take a phone order and send a payment link, so a manual
        // order needs the same reservation deadline as a storefront one — its
        // stock must expire rather than be held forever by a link nobody opened.
        reservationExpiresAt: this.resolveReservationDeadline(
          dto.paymentMethod ?? PaymentMethod.ON_DELIVERY,
        ),
      },
      adminUserId,
    );

    this.logger.info(
      {
        event: 'order.created_by_operator',
        orderId: order.id,
        adminUserId,
        forAccount: Boolean(dto.userId),
      },
      'Operator created an order on the customer’s behalf',
    );

    return OrderEntity.fromPrisma(order, { includeInternal: true });
  }

  /**
   * Admin — correct an order's delivery address before it ships (TASK-341).
   *
   * Pre-shipment only. Once the parcel is with the courier, the address on the
   * waybill is the one that counts; editing the order afterwards would not move
   * the parcel, it would only make the record disagree with reality — and the
   * record is what support reads when the customer calls.
   *
   * @throws ConflictException when the order has already shipped.
   */
  async adminUpdateShippingAddress(
    orderId: string,
    shippingAddress: AddressDto,
    options: { expectedUpdatedAt?: Date } = {},
  ): Promise<OrderEntity> {
    const existing = await this.orderRepository.findById(orderId);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    this.assertFresh(existing, options.expectedUpdatedAt);

    if (!PRE_SHIPMENT_STATUSES.has(existing.status)) {
      throw new ConflictException(
        'The delivery address can only be changed before the order ships',
      );
    }

    const order = await this.orderRepository.updateShippingAddress(
      orderId,
      shippingAddress,
      options,
    );

    this.logger.info(
      { event: 'order.address_updated', orderId },
      'Delivery address corrected before shipment',
    );

    return OrderEntity.fromPrisma(order, { includeInternal: true });
  }

  /**
   * Tell the customer their parcel is on its way (TASK-335).
   *
   * Enqueued through the existing outbox rather than sent inline, so a flaky SMTP
   * cannot fail an operator's status change — the same reasoning as the
   * order-confirmation email.
   *
   * NOT enqueued inside the status transaction: by the time this runs the
   * shipment is already committed and irreversible from the customer's point of
   * view (the parcel is physically gone). Losing the notice to a crash here is
   * recoverable by re-saving the waybill; rolling back a real shipment because an
   * outbox insert failed is not.
   *
   * Never throws. A failure to notify must not turn into a failed status change,
   * because the operator would then retry the transition — and the state machine
   * would refuse it, leaving them stuck with a shipped parcel and an order that
   * says otherwise.
   */
  private async notifyShipped(order: OrderWithItems): Promise<void> {
    try {
      const recipient = await this.orderRepository.findRecipient(order.id);

      if (!recipient) {
        this.logger.warn(
          { event: 'order.shipped_notice_no_recipient', orderId: order.id },
          'Order shipped but no email address is on file — no notice sent',
        );
        return;
      }

      await this.mailOutbox.enqueueOrderShipped({
        to: recipient.email,
        ...(recipient.name ? { customerName: recipient.name } : {}),
        order: {
          id: order.id,
          trackingNumber: order.trackingNumber ?? null,
        },
      });

      this.logger.info(
        {
          event: 'order.shipped_notice_enqueued',
          orderId: order.id,
          hasTracking: Boolean(order.trackingNumber),
        },
        'Shipment notice enqueued',
      );
    } catch (err) {
      this.logger.error(
        { err, event: 'order.shipped_notice_failed', orderId: order.id },
        'Failed to enqueue the shipment notice; the order status change stands',
      );
    }
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
  /**
   * When an unpaid order of this kind must be auto-cancelled and its stock
   * returned, or null when it never should.
   *
   * Only card-style methods get a deadline. Cash on delivery holds its
   * reservation indefinitely — the shopper has promised nothing yet and an
   * operator decides — which is the hybrid the owner chose on 2026-07-28.
   *
   *  and  are settings
   * rather than constants on purpose (TASK-352): the window is still open with
   * the client, and the answer must be an env change, not a rewrite of this.
   */
  private resolveReservationDeadline(method: PaymentMethod): Date | null {
    if (method === PaymentMethod.ON_DELIVERY) return null;

    const enabled = this.configService.get<string>('ORDER_AUTOCANCEL_UNPAID') !== 'false';
    if (!enabled) return null;

    const minutes =
      Number(this.configService.get<string>('ORDER_RESERVATION_TTL_MINUTES')) ||
      DEFAULT_RESERVATION_TTL_MINUTES;

    return new Date(Date.now() + minutes * 60_000);
  }
  private async snapshotAddons(
    cart: CartWithItems,
    // Null for a guest order (TASK-338). Used only to attribute the "dropped a
    // stale add-on" warning, so a guest simply has nothing to attribute it to.
    userId: string | null,
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
