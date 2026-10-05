import {
  Prisma,
  DeliveryMethod,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  PaymentAttemptStatus,
  OrderHistoryChangeType,
  OrderHistoryNote,
} from '@prisma/client';
import type { CartWithItems } from '../cart';
import type { AddressDto } from './dto';

/**
 * A single order-status-history audit row as returned by the repository
 * (TASK-251). Mirrors the `OrderStatusHistory` Prisma model. STATUS rows
 * populate `fromStatus`/`toStatus` (payment pair null); PAYMENT_STATUS rows
 * populate `fromPaymentStatus`/`toPaymentStatus` (status pair null). `changedBy`
 * is null for system-authored rows (order creation, future payment webhook).
 */
export interface OrderStatusHistoryRow {
  id: string;
  orderId: string;
  changeType: OrderHistoryChangeType;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  fromPaymentStatus: PaymentStatus | null;
  toPaymentStatus: PaymentStatus | null;
  changedBy: string | null;
  /** TASK-619 / TASK-788: a flag the operator lists query; null on an ordinary row. */
  note: OrderHistoryNote | null;
  /**
   * TASK-621: on a PAYMENT_EVENT_REFUSED row, the payment status the provider's
   * event asked for; null everywhere else (and on refusals written before it).
   */
  rejectedPaymentStatus: PaymentStatus | null;
  changedAt: Date;
}

/**
 * Typed shape of the address JSON snapshot embedded in an order.
 * Mirrors {@link AddressDto}. The order stores addresses as `Json?` columns
 * (snapshot semantics), so this interface is used to deserialize them back
 * into a typed object inside the entity.
 */
export interface ShippingAddressData {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  // Optional on AddressDto (TASK-229) — snapshots created before the server-side
  // country default may lack both fields, so reads must not assume them.
  postalCode?: string;
  country?: string;
  phone?: string;
  /** Nova Poshta delivery refs (TASK-080) — present only for NP-routed orders. */
  npCityRef?: string;
  npWarehouseName?: string;
  npWarehouseRef?: string;

  // ─── Delivery snapshot (TASK-643) ──────────────────────────────────────────
  // Written at checkout and never rewritten, like the rest of this object. All
  // optional: snapshots created before TASK-643 lack them, and readers fall back
  // to `Order.deliveryMethod` (backfilled by TASK-642).

  /** How the order is delivered, as decided at checkout. */
  deliveryMethod?: DeliveryMethod;
  /**
   * Which carrier moves the parcel — `'NOVA_POSHTA'` for NP, null for pickup,
   * the shop's courier and "operator will quote". A neutral field, so adding
   * Ukrposhta later is a new value here rather than a migration of history
   * (B-6 §3).
   */
  carrier?: DeliveryCarrier | null;
  /**
   * True only for OTHER: the booked shipping cost (0) is a placeholder the
   * operator will replace, not free delivery. Surfaces must say "вартість
   * доставки уточнить оператор" instead of "Доставка: 0 грн" (B-6 §4).
   */
  shippingCostPending?: boolean;
  /**
   * PICKUP only: the point's name and address AS THEY WERE at checkout, so a
   * later edit or deletion of the point cannot rewrite this order's history.
   * `city`/`address1` carry the point's city/address too.
   */
  pickupPointName?: string;
  pickupPointAddress?: string;
}

/** Carriers an order can be handed to (TASK-643). One value today, by design. */
export type DeliveryCarrier = 'NOVA_POSHTA';

/**
 * A single order line as returned by repository queries, including the
 * snapshotted product (position) reference details.
 */
export interface OrderItemRow {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: { toString(): string }; // Prisma Decimal
  createdAt: Date;
  product: {
    id: string;
    name: string;
    slug: string;
    images: Array<{ url: string }>;
    /**
     * ── Availability columns (TASK-470) ────────────────────────────────────
     * Joined by `ADMIN_ORDERS_INCLUDE` only, so they are OPTIONAL: a
     * customer-facing read never asks for them, and `undefined` there means
     * "not measured", never "available". `OrderEntity.fromPrisma` reads that
     * distinction directly — it omits `unavailableItemIds` entirely rather
     * than reporting an empty array it did not measure.
     *
     * `deletedAt != null` = the catalogue row is a tombstone; `isActive =
     * false` = unpublished; `stock < 0` = oversold after an inventory
     * correction. The three conditions of owner decision B-1 §3 that live on
     * the PRODUCT; the fourth (the reservation lifted by TTL) lives on the
     * order itself.
     */
    deletedAt?: Date | null;
    isActive?: boolean;
    stock?: number;
  };
  /**
   * Frozen add-on snapshots bought with this line (TASK-174). `name`/`price` are
   * copied at order-creation time, exactly like `OrderItem.price` snapshots
   * `Product.price` — a later catalog reprice, template edit, or delta edit never
   * rewrites them.
   */
  addons: OrderItemAddonRow[];
}

/**
 * One frozen add-on snapshot on an order line (TASK-174).
 */
export interface OrderItemAddonRow {
  id: string;
  addonServiceId: string | null;
  name: string;
  price: { toString(): string }; // Prisma Decimal
}

/**
 * The add-on snapshot the service resolved for a cart line at order-creation
 * time, ready to be frozen into `OrderItemAddon` rows (TASK-174).
 */
export interface OrderAddonSnapshot {
  addonServiceId: string;
  name: string;
  /** Effective price as a decimal string, as returned by the resolver. */
  price: string;
}

/**
 * Order with its items and related product/variant details.
 * This is the shape returned by all order queries — it mirrors the
 * `CartWithItems` pattern in `cart.repository.ts`.
 */
export interface OrderWithItems {
  id: string;
  /**
   * Null on a guest order (TASK-338). Exactly one of `userId` and the guest
   * contact block below is populated; the application holds that invariant,
   * because Prisma cannot express "one of these two".
   */
  userId: string | null;
  /** Contact details captured at guest checkout (TASK-338); null on account orders. */
  guestEmail?: string | null;
  guestPhone?: string | null;
  guestName?: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: { toString(): string };
  discount: { toString(): string };
  discountCode: string | null;
  shippingCost: { toString(): string };
  tax: { toString(): string };
  /**
   * Sum of the frozen add-on snapshots across all lines (TASK-174). Excluded
   * from the discount base, exactly like `shippingCost`:
   * `total = subtotal + shippingCost + addonsTotal - discount`.
   */
  addonsTotal: { toString(): string };
  total: { toString(): string };
  shippingAddress: Prisma.JsonValue | null;
  billingAddress: Prisma.JsonValue | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * TASK-228: when an automatic cancellation last returned this order's stock
   * to inventory; null while the order still "owns" its items. The service
   * consults it to re-reserve stock on revive and to prevent double restocks.
   */
  restockedAt: Date | null;
  /**
   * ── Stage-8 columns (TASK-330 / 332 / 335 / 336) ──────────────────────────
   * Declared OPTIONAL even though every read path selects the whole order row.
   * The fixtures across the unit and e2e suites predate these columns, and making
   * them required would turn a purely additive change into a rewrite of a dozen
   * unrelated test files for no gain in safety: every one of them is nullable in
   * the schema, so `undefined` and `null` mean the same thing to every reader.
   * This is the same treatment `addonsTotal` already gets in
   * `OrderEntity.fromPrisma` (`?? '0'`).
   */

  /** How the customer chose to pay (TASK-330). */
  paymentMethod?: PaymentMethod;
  /** How the order ships (TASK-642); the column defaults to NOVA_POSHTA. */
  deliveryMethod?: DeliveryMethod;
  /** When money actually settled (TASK-330); null while unpaid. */
  paidAt?: Date | null;
  /** Deadline on an unpaid ONLINE order's stock reservation (TASK-330). */
  reservationExpiresAt?: Date | null;
  /** Nova Poshta waybill typed in by the operator (TASK-335). */
  trackingNumber?: string | null;
  /**
   * Operator-only notes (TASK-336). Strictly distinct from `notes`, which is what
   * the CUSTOMER typed at checkout — this one must never reach a customer-facing
   * response.
   */
  internalNotes?: string | null;
  /**
   * When the order-access token currently on this row was issued (TASK-484).
   *
   * The TTL of a guest's status link is counted from HERE, not from `createdAt`:
   * an operator can re-issue the link at any point in the order's life (B-5 §4),
   * and a clock started at checkout would hand out a link that was already dead
   * the moment it was pasted into a chat. Null on every order minted before the
   * column existed, which is why every reader falls back to `createdAt`.
   */
  accessTokenIssuedAt?: Date | null;
  items: OrderItemRow[];
  /**
   * Owning user account, selected only by the admin read paths
   * (`findAll` / `findByIdForAdmin`) via `ADMIN_ORDERS_INCLUDE`. Absent on
   * customer-facing and mutation queries, which use the lean `ORDERS_INCLUDE`.
   */
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  /**
   * Refunded amounts of this order's return requests (TASK-472), selected only by
   * the admin read paths via `ADMIN_ORDERS_INCLUDE`.
   *
   * Optional and deliberately thin: the entity needs a SUM, not the returns. An
   * absent array means "this read did not ask", which is why
   * {@link OrderEntity.fromPrisma} omits `refundedTotal` rather than reporting a
   * zero it did not measure — a zero would read as "nothing was refunded" on
   * every customer-facing response.
   *
   * `refundedAmount` is null until a return is actually paid out, so nulls are
   * skipped rather than counted.
   */
  returns?: Array<{ refundedAmount: { toString(): string } | null }>;
}

/**
 * Parameters for creating an order from a cart. The service resolves and
 * validates the cart, then hands the already-loaded cart lines to the
 * repository so the transactional write is a pure data apply.
 */
export interface CreateOrderParams {
  /** Null for a guest order (TASK-338) — see {@link OrderActor}. */
  userId: string | null;
  /**
   * Guest checkout block (TASK-338). Present exactly when `userId` is null. The
   * contact details are a SNAPSHOT of what was typed at checkout and are kept
   * forever, even after the order is later claimed by an account: they are the
   * record of what the buyer actually asked for that day.
   */
  guest?: {
    email: string;
    phone: string;
    name: string;
    /**
     * SHA-256 of the token that goes in the confirmation email. The raw value
     * NEVER reaches the database — same at-rest pattern as RefreshToken /
     * PasswordResetToken.
     */
    accessTokenHash: string;
  };
  cartId: string;
  cartItems: CartWithItems['items'];
  /**
   * The add-ons to freeze onto each line, keyed by CART ITEM id (TASK-174). The
   * service re-resolves them fresh at order-creation time — exactly like stock
   * and the discount are re-validated fresh — so a selection that has since
   * become inapplicable is already gone by the time the repository sees it. A
   * line with no selected add-ons is simply absent from the map.
   */
  addonsByCartItemId?: Map<string, OrderAddonSnapshot[]>;
  /**
   * The address as typed, plus the delivery snapshot the service adds
   * (TASK-643: method, carrier, pickup point, "to be quoted" marker).
   */
  shippingAddress: AddressDto | ShippingAddressData;
  billingAddress?: AddressDto;
  notes?: string;
  /**
   * Shipping cost (UAH) decided by the service for the resolved delivery method
   * (TASK-643): the NP estimate, 0 for pickup and OTHER, the courier price or 0
   * past its threshold. The client never supplies it. Absent → repository
   * writes 0 (kept for callers that predate TASK-643).
   */
  shippingCost?: number;
  /**
   * How the order is delivered (TASK-643). Required: the service always
   * resolves one, and leaving it to the column default would book a free-text
   * order as NOVA_POSHTA.
   */
  deliveryMethod: DeliveryMethod;
  /** The pickup point of a PICKUP order (TASK-643); absent for every other method. */
  pickupPointId?: string;
  /**
   * How the shopper chose to pay (TASK-330). Absent → the column default,
   * ON_DELIVERY.
   */
  paymentMethod?: PaymentMethod;
  /**
   * When an unpaid order of this kind must be auto-cancelled and its stock
   * returned, or null when it never should (TASK-330).
   *
   * Load-bearing rather than informational: `findExpiredReservations` matches on
   * this column AND an ONLINE/INSTALLMENTS method, so leaving it unset made the
   * reconcile worker unable to find a single row — it ran every minute and
   * cancelled nothing, while stock held by abandoned card payments was never
   * returned. Nothing failed; it simply never happened.
   */
  reservationExpiresAt?: Date | null;
  /**
   * Optional promo-code discount to apply inside the order transaction
   * (TASK-079). The service has already recomputed the amount authoritatively
   * via DiscountService.computeDiscount; the repository persists `amount` +
   * `code` on the order, subtracts it from the total, and runs `redeem` (the
   * service's cap re-check + redemption insert) within the same `$transaction`,
   * so a cap race or a deactivation rolls the whole order back.
   */
  discount?: {
    /** Recomputed discount amount as a decimal string ("XX.YY"). */
    amount: string;
    /** The applied promo code (uppercase), snapshotted on the order. */
    code: string;
    /** Redeem callback bound to the discount + user; called with the new order id and the tx. */
    redeem: (orderId: string, tx: Prisma.TransactionClient) => Promise<void>;
  };
}

/**
 * The Payment attempt a provider callback refers to, with just enough of its
 * order attached to decide what the event means (TASK-330).
 *
 * Read by {@link OrderRepository.findPaymentWithOrder} and consumed by
 * `OrderService.applyPaymentEvent`. The order side is deliberately minimal: the
 * decision needs the current statuses and nothing else, and a slim row keeps a
 * hot webhook path from dragging every order line and product image with it.
 */
export interface PaymentWithOrderRow {
  id: string;
  orderId: string;
  provider: string;
  providerPaymentId: string | null;
  /** Frozen at creation — the figure a callback's amount is checked against. */
  amount: { toString(): string };
  currency: string;
  status: PaymentAttemptStatus;
  order: {
    id: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paidAt: Date | null;
    reservationExpiresAt: Date | null;
    /**
     * Set when the order's stock hold was given back (TASK-627: on a LIVE order
     * this is what ORDER_RESERVATION_EXPIRY=release leaves) — a success must
     * then re-take the stock rather than assume it is held.
     */
    restockedAt: Date | null;
    /**
     * TASK-678: whether this order is announced to the shop on payment (online)
     * or was already announced at creation (ON_DELIVERY) — see shop-order-ping.ts.
     */
    paymentMethod: PaymentMethod;
    /** TASK-678: the account whose name the shop's ping prints; null for a guest. */
    userId: string | null;
  };
}

/**
 * A fully-decided payment application, ready to be written (TASK-330).
 *
 * The SERVICE decides all of this — which attempt status, whether the order's
 * payment status moves, whether the order status may follow, whether the
 * reservation deadline is lifted. The REPOSITORY only writes it, in one
 * transaction. That split is what keeps the "everything or nothing" rule
 * enforceable: there is exactly one place where a partial application could be
 * introduced, and it contains no branching on business meaning.
 */
export interface PaymentApplyPlan {
  paymentId: string;
  orderId: string;
  /**
   * The order statuses this plan was decided against. The read that produced
   * them is not locked, so the repository writes the order only if both still
   * hold — a TTL cancel that committed in between (restock done, `restockedAt`
   * stamped) must not be overwritten by a CONFIRMED/PAID that assumed PENDING.
   */
  expected: { status: OrderStatus; paymentStatus: PaymentStatus };
  /** New lifecycle state of THIS attempt. */
  attemptStatus: PaymentAttemptStatus;
  /** The provider's own id, learned from the callback; '' when it sent none. */
  providerPaymentId?: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  /** Stamped on the attempt when it reached a final, money-moved state. */
  settledAt?: Date | null;
  /**
   * Order payment-status move. Omitted when the event changes only the attempt
   * (e.g. a late failure for a superseded attempt on an already-paid order).
   */
  paymentStatusChange?: {
    from: PaymentStatus;
    to: PaymentStatus;
    /**
     * Written onto the PAYMENT_STATUS history row when the move is one the shop
     * recorded but did not otherwise act on (TASK-619: a success on a CANCELLED
     * order → `PAID_AFTER_CANCEL`). Omitted for an ordinary move.
     */
    note?: OrderHistoryNote;
  };
  /**
   * An order payment-status move the state machine refused (TASK-431).
   *
   * Mutually exclusive with {@link paymentStatusChange}: exactly one of the two
   * can be set, because either the move happened or it did not. When this is set
   * the order's columns are left untouched and the repository writes ONE
   * `OrderStatusHistory` row recording that the payment status stayed where it
   * was (`current → current`) at the moment the event arrived.
   *
   * The row deliberately does not claim the rejected target as a `to`: a chain of
   * history rows is read as a chain, and a row saying "PAID → FAILED" on an order
   * that is still PAID would break it for every later reader. The rejected value
   * goes to the structured log, next to the provider status that asked for it,
   * AND (TASK-621) onto the row itself as `note = PAYMENT_EVENT_REFUSED` plus
   * `rejectedPaymentStatus`, so the timeline can say «відхилено», not «PAID → PAID».
   *
   * `reason` says WHICH rule refused (review of plan 180). Without it the log is
   * ambiguous in the one case that matters: a refund refused by the cross-rule on
   * a PROCESSING order logs `current: PAID, rejected: REFUNDED` — a pair
   * `PAYMENT_TRANSITIONS` explicitly ALLOWS — so whoever reads the line has to
   * open the order to learn the refusal came from the order status, not the
   * table. This door never raises, so this log is its only diagnostic.
   */
  refusedPaymentStatusChange?: {
    current: PaymentStatus;
    rejected: PaymentStatus;
    /** `table` — PAYMENT_TRANSITIONS; `crossRule` — B-1 §1, the order is live. */
    reason: 'table' | 'crossRule';
  };
  /** Set when money settled; null leaves the column untouched. */
  paidAt?: Date | null;
  /**
   * Lift the stock-reservation deadline. True exactly when payment succeeded:
   * a paid order's reservation is no longer provisional, so the auto-cancel
   * worker must never see it again.
   */
  clearReservation?: boolean;
  /**
   * The order's stock hold as the plan read it (TASK-627) — set on a success
   * that makes a LIVE order paid, omitted everywhere else.
   *
   * - `held` — `restockedAt IS NULL` joins the conditional write, so a release
   *   (ORDER_RESERVATION_EXPIRY=release) that committed after the read is not
   *   paid over as if the stock were still held: zero rows, rollback, and the
   *   retry is re-planned as `released`.
   * - `released` — `restockedAt IS NOT NULL` joins it instead, and the lines are
   *   re-reserved in the same transaction with the oversell guard. If any line is
   *   short, nothing is taken and `restockedAt` stays: the money is recorded, the
   *   order shows in «Позиція недоступна», and the operator decides.
   */
  stockHold?: 'held' | 'released';
  /**
   * Order status move, already validated against the state machine by the
   * service. Absent when the operator has moved the order past the point where
   * a payment event would have anything to say about it.
   */
  statusChange?: { from: OrderStatus; to: OrderStatus };
}

/**
 * Contact details a guest types at checkout (TASK-338).
 *
 * There is no account behind a guest order, so these three fields are the only
 * way to reach the buyer — the confirmation email, the courier's phone call, the
 * name on the parcel. They are snapshotted onto the order and never rewritten,
 * not even when an account later claims it.
 */
export interface GuestContact {
  email: string;
  phone: string;
  name: string;
}

/**
 * Who is placing an order (TASK-338).
 *
 * Before guest checkout, "who" was always a user id, so the signature could just
 * take a string. It cannot any more, and an optional `userId?: string` would have
 * been the wrong fix: it makes "neither" and "both" expressible, and the whole
 * point is that exactly one of the two holds. A discriminated union makes the
 * invariant the type system's job instead of a comment nobody reads.
 *
 * The guest arm carries the cart token rather than a user id because that cookie
 * is the only thing identifying a guest's cart — the same identity the cart
 * module has been resolving all along (`ResolvedCartIdentity`).
 */
export type OrderActor =
  { type: 'user'; userId: string } | { type: 'guest'; cartToken: string; contact: GuestContact };

/**
 * An order the OPERATOR placed on the customer's behalf — a phone order
 * (TASK-341).
 *
 * `items[].price` is filled by the SERVICE from the live catalogue, never from
 * the request: an operator-created order is still a sale at the shop's price, and
 * accepting a price from the admin panel would make every discount a matter of
 * whoever is on the phone.
 */
export interface ManualOrderParams {
  /** The account this order belongs to, or null when the caller is a walk-in. */
  userId?: string | null;
  /** Contact details when there is no account behind the order. */
  guest?: GuestContact;
  /**
   * SHA-256 of the order-access token minted for this phone order (TASK-484).
   *
   * A SEPARATE field rather than part of {@link guest}, because the two do not
   * travel together here: an operator-created order can belong to an ACCOUNT and
   * still need a link — the customer dictated the order over the phone and may
   * never have signed in on the device they will open it on. The raw value never
   * reaches this layer; the service hashes it first, exactly as guest checkout
   * does (see `CreateOrderParams.guest.accessTokenHash`).
   */
  accessTokenHash?: string;
  items: Array<{
    productId: string;
    quantity: number;
    /** Snapshotted from the catalogue by the service. */
    price: string;
    /** For the insufficient-stock message; not persisted. */
    name: string;
  }>;
  shippingAddress: AddressDto;
  billingAddress?: AddressDto;
  notes?: string;
  internalNotes?: string;
  shippingCost?: number;
  paymentMethod?: PaymentMethod;
  /**
   * How the phone order is delivered (TASK-643), classified by the same rule as
   * a legacy checkout: NP city ref → NOVA_POSHTA, otherwise OTHER. Absent → the
   * column default (NOVA_POSHTA).
   */
  deliveryMethod?: DeliveryMethod;
  /**
   * Reservation deadline for an operator-created order (TASK-330). Present for
   * the same reason as on {@link CreateOrderParams}: an operator can take a phone
   * order and send a payment link, and that order's stock must expire like any
   * other unpaid card order rather than being held forever.
   */
  reservationExpiresAt?: Date | null;
}
