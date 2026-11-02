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
import {
  DeliveryMethod,
  OrderHistoryNote,
  OrderStatus,
  PaymentStatus,
  PaymentAttemptStatus,
  PaymentMethod,
  type Prisma,
} from '@prisma/client';
import { OrderRepository, type AdminOrderExportRow } from './order.repository';
// TASK-483: the public lookup has its own repository — see its docblock for why
// the narrow projection gets a narrow query rather than a filtered wide one.
import { OrderLookupRepository } from './order-lookup.repository';
import { CartService, type CartWithItems } from '../cart';
import { UserRepository } from '../user';
import { NotificationOutboxService } from '../notification-outbox';
import { CustomerNotifier, ShopNotifier } from '../notification';
import { DeliveryService, isDeliveryNotConfigured, type DeliveryMethodSettings } from '../delivery';
import { DiscountService } from '../discount';
import { CheckoutAccountService, type IssuedSession } from '../auth';
import { OrderEntity, OrderStatusHistoryEntity, PublicOrderEntity } from './entities';
import { PRE_SHIPMENT_STATUSES } from './order.constants';
import { allowedTransitions, canTransition, canTransitionPayment } from './order-state-machine';
// TASK-643: the delivery × payment matrix and the non-NP pricing rules.
import {
  isPaymentAllowedForAdminDelivery,
  isPaymentAllowedForDelivery,
} from './delivery-payment-matrix';
import {
  ALREADY_PAID_STATUSES,
  confirmsPaymentOfLiveOrder,
  shopPingAtCreation,
  shopPingOnPaymentConfirmed,
} from './shop-order-ping';
import { flatShippingCost, resolveDeliveryMethod } from './shipping-cost';
import {
  buildDeliverySnapshot,
  pickupPointFromSnapshot,
  pickupPointSnapshot,
  type PickupPointSnapshot,
} from './delivery-snapshot';
import {
  deliveryMethodUnavailableError,
  deliveryNpCityRequiredError,
  deliveryPaymentNotAllowedError,
  deliveryPickupPointRequiredError,
  deliveryPickupPointUnavailableError,
  deliveryShippingCostNotAllowedError,
  discountAccountRequiredError,
  paymentAccountRequiredError,
  manualOrderDeliveryPaymentNotAllowedError,
  orderVersionRequiredError,
  invalidTransitionError,
  reviveRefundedPaymentError,
  staleOrderError,
} from './order.errors';
import {
  AddonApplicabilityResolver,
  centsToString,
  sumLineCents,
  toCents,
  toTwoDecimals,
} from '../addon-service';
import { isCategoryOnSale } from '../product';
// Shared with the newsletter export: one formula-injection guard, so a fix
// cannot land in one export and miss the other (see the helper's docblock).
import { buildCsvDocument, escapeCsvField, toSingleCsvLine } from '../common/utils';
// TASK-483/466: one canonical phone spelling on both sides of the comparison.
import { normalizeUaPhone } from '../common/validators';
import type { Paginated } from '../common/pagination';
import type {
  CreateOrderDto,
  CreateManualOrderDto,
  OrderListQueryDto,
  AdminOrderListQueryDto,
  AddressDto,
  OrderLookupDto,
} from './dto';
// TASK-483: value imports (the normaliser and the shape it must satisfy), so
// they cannot be in the `import type` block above.
import { ORDER_NUMBER_PATTERN, normalizeOrderNumber } from './dto';
// Declared beside the list query it narrows; deliberately not in the DTO barrel.
import type { AdminOrderExportQueryDto } from './dto/admin-order-list-query.dto';
import type {
  CreateOrderParams,
  OrderActor,
  OrderAddonSnapshot,
  OrderWithItems,
  PaymentApplyPlan,
  PaymentWithOrderRow,
  ProviderRefundRequest,
  ProviderRefundRequestInput,
  PlacedOrder,
  ShippingAddressData,
} from './order.types';
import type { PaymentApplyResult, PaymentEventInput } from '../payment';
// eslint-disable-next-line local/no-deep-module-import -- cycle: payment barrel > payment.module > order barrel > this file
import { PaymentOutcome } from '../payment/payment.types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

/**
 * Hard cap on one admin CSV export (TASK-425).
 *
 * The export is unpaginated by design — "the orders I am looking at", not "this
 * page of them" — but unpaginated must not mean unbounded: the request holds
 * every matching row in memory AND the whole CSV string built from it, so
 * "export everything" over a few years of orders is how an admin panel takes the
 * API down. 5 000 rows is roughly a megabyte of text, which any server we would
 * deploy on shrugs off.
 *
 * The rows kept are the NEWEST ones, so a truncated export still contains what
 * an operator opened a spreadsheet for; narrowing by date or status is how they
 * reach the rest. The admin table warns when the filtered total exceeds this,
 * because a silently truncated file is worse than a refused one.
 */
export const ORDER_EXPORT_MAX_ROWS = 5000;

/**
 * CSV header for the admin order export (TASK-425).
 *
 * Machine-readable keys and RAW enum values, matching the newsletter export: the
 * file is as often re-imported or pivoted as it is read, and a column translated
 * to «Очікує підтвердження» cannot be filtered back to PENDING. `orderNumber` is
 * the 8-character number printed on the customer's email; `orderId` is the full
 * uuid support needs. `notes` is deliberately absent — free text with newlines
 * in it is what turns a CSV into an unopenable file.
 */
const ORDER_EXPORT_HEADER = [
  'orderNumber',
  'orderId',
  'createdAt',
  'status',
  'paymentStatus',
  'paymentMethod',
  // TASK-648. The one translated column, by the plan's decision: an operator
  // reads it in a spreadsheet, and its four values filter back just as well as
  // the enum would. Labels in DELIVERY_METHOD_EXPORT_LABEL below.
  'Спосіб доставки',
  'paidAt',
  'customerType',
  'customerName',
  'customerEmail',
  'customerPhone',
  'city',
  'itemLines',
  'subtotal',
  'addonsTotal',
  'discount',
  'discountCode',
  'shippingCost',
  'tax',
  'total',
  'trackingNumber',
] as const;

/**
 * The «Спосіб доставки» CSV cell for each method (TASK-648), spelled as the
 * admin panel spells them — «Курʼєр» with U+02BC, the panel's apostrophe. A
 * `Record`, so a fifth method fails to compile until it has a label.
 */
const DELIVERY_METHOD_EXPORT_LABEL: Readonly<Record<DeliveryMethod, string>> = {
  NOVA_POSHTA: 'Нова Пошта',
  PICKUP: 'Самовивіз',
  COURIER: 'Курʼєр',
  OTHER: 'Інша доставка',
};

/** What `GET /admin/orders/facets` answers (TASK-648). */
export interface AdminOrderFacets {
  /** Orders per delivery method under every filter but the method one; all four keys. */
  deliveryMethod: Record<DeliveryMethod, number>;
}

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
/**
 * The amount a provider event reported, in integer kopecks, or null when it
 * reported none (`''`) or something unreadable — the refund match then falls
 * back to "no amount to compare" (TASK-2336 mitigation).
 */
function reportedAmountKop(amount: string): number | null {
  if (amount.trim() === '') return null;
  const kop = toCents(amount);
  return Number.isSafeInteger(kop) && kop > 0 ? kop : null;
}

function hashGuestToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Units across all lines of an order — what the Telegram messages print as «N шт.». */
function countUnits(order: { items: ReadonlyArray<{ quantity: number }> }): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
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
 * «No money has arrived yet» on an order paid online (TASK-788) — the same test
 * as the admin panel's «Оплату не підтверджено — відправляти?» dialog
 * (`order-status-select.tsx`, TASK-468). PENDING/FAILED only: PARTIALLY_REFUNDED
 * and REFUNDED are reachable solely FROM PAID, so there the money did arrive.
 */
function isUnconfirmedOnlinePayment(order: {
  // Optional on the row type (older fixtures); an absent method is not ONLINE.
  paymentMethod?: PaymentMethod;
  paymentStatus: PaymentStatus;
}): boolean {
  return (
    order.paymentMethod === PaymentMethod.ONLINE &&
    (order.paymentStatus === PaymentStatus.PENDING || order.paymentStatus === PaymentStatus.FAILED)
  );
}

/**
 * What an operator gets back after taking an order over the phone (TASK-484).
 *
 * Two values rather than one because the second cannot be fetched again: the
 * raw access link exists for this response and nowhere else — the database
 * keeps only its SHA-256. If the operator does not copy it now, the way to get
 * one is to ISSUE A NEW one from the order card, which retires this one.
 *
 * `accessUrl` is null only when `STORE_CLIENT_URL` is unset — a dev box. The
 * token is still minted and stored in that case, so a correctly-configured
 * environment can issue a working link for the same order later.
 */
export interface ManualOrderResult {
  order: OrderEntity;
  accessUrl: string | null;
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
    // TASK-483: the public lookup's own narrow query.
    private readonly orderLookupRepository: OrderLookupRepository,
    // TASK-827: the cart through its service, not another module's repository.
    private readonly cartService: CartService,
    private readonly userRepository: UserRepository,
    private readonly mailOutbox: NotificationOutboxService,
    private readonly deliveryService: DeliveryService,
    private readonly discountService: DiscountService,
    private readonly addonResolver: AddonApplicabilityResolver,
    // TASK-338: reads GUEST_ORDER_TOKEN_TTL_DAYS — how long a guest's emailed
    // status link stays usable.
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
    // TASK-677: the shop's Telegram ping for a storefront order.
    private readonly shopNotifier: ShopNotifier,
    // TASK-680: the buyer's own Telegram messages, next to their letters.
    private readonly customerNotifier: CustomerNotifier,
    // TASK-2010: the account a guest creates at checkout (auth module's side).
    private readonly checkoutAccounts: CheckoutAccountService,
  ) {
    this.logger.setContext(OrderService.name);
  }

  /**
   * Create an order from the user's current cart.
   *
   * The order alone — see {@link placeOrder} for the variant that also hands a
   * guest their access token.
   *
   * @throws ForbiddenException when the placing account is deactivated (banned).
   * @throws NotFoundException when the user has no cart.
   * @throws BadRequestException when the cart is empty or a variant has
   *   insufficient stock at order-creation time.
   */
  async createOrder(actor: OrderActor, dto: CreateOrderDto): Promise<OrderEntity> {
    return (await this.placeOrder(actor, dto)).order;
  }

  /**
   * Create an order, and give a guest the raw access token of it (TASK-679,
   * owner decision 2026-10-07).
   *
   * The token is the same one the confirmation letter carries — the guest's
   * proof that this order is theirs. The success page needs it to offer the
   * Telegram link before the letter has even arrived, and it is the person who
   * just placed the order asking, through the very request that minted it, so
   * nothing is disclosed that the letter does not disclose anyway. Only the
   * create response carries it; no read ever returns it — only the hash is
   * stored. `null` for an account order: an account proves itself by its session.
   */
  async placeOrder(actor: OrderActor, dto: CreateOrderDto): Promise<PlacedOrder> {
    // ─── TASK-338: resolve who is buying, and from which cart ──────────────────
    // The two arms differ in exactly three things — the ban check, which cart to
    // load, and where the confirmation email is addressed. Everything after this
    // block (stock re-validation, add-ons, discounts, the transaction) is shared,
    // because a guest order is a real order in every other respect.
    const userId = actor.type === 'user' ? actor.userId : null;

    // ─── TASK-2010: what a guest needs an account for ─────────────────────────
    // «Створити акаунт на цю пошту» turns a guest checkout into an account one:
    // the account is created inside the order transaction (below) and signed in.
    // Without the box, the two things only an account can carry are refused up
    // front, before any cart work, each with its own code the storefront keys
    // its auto-ticked box off: a promo code (B-12 тема 2 (в)) and a card payment
    // (B-13 (ж) — a guest's card order could never be paid).
    const signupEmail =
      actor.type === 'guest' && actor.createAccount === true ? actor.contact.email : null;
    const paymentMethod = dto.paymentMethod ?? PaymentMethod.ON_DELIVERY;

    if (actor.type === 'guest' && !signupEmail) {
      if (dto.discountCode) {
        throw discountAccountRequiredError();
      }
      if (paymentMethod === PaymentMethod.ONLINE || paymentMethod === PaymentMethod.INSTALLMENTS) {
        throw paymentAccountRequiredError();
      }
    }

    // Never a second account on one address (B-12 тема 2 (б)): any account row
    // on it — a deactivated one included, the lookup `register` uses — is a 409 the storefront
    // answers with «Увійти». Checked before anything is written; a sign-up racing
    // this one is caught again by the unique index inside the transaction.
    if (signupEmail) {
      await this.checkoutAccounts.assertNoAccount(signupEmail);
    }

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

    const cart = await this.cartService.loadForCheckout(
      actor.type === 'user'
        ? { type: 'user', userId: actor.userId }
        : { type: 'token', token: actor.cartToken },
    );

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
      // `isCategoryOnSale`: the category AND its ancestor chain (TASK-1032).
      if (!item.product.isActive || !isCategoryOnSale(item.product.category)) {
        throw new BadRequestException(`Product "${item.product.name}" is no longer available`);
      }
      if (item.quantity > item.product.stock) {
        throw new BadRequestException(
          `Insufficient stock for "${item.product.name}" — ${item.product.stock} available`,
        );
      }
    }

    // `paymentMethod` (resolved at the top, TASK-2010): absent means cash on
    // delivery — the honest reading of a request that never mentions payment,
    // and what every pre-TASK-330 order actually was.

    // The PRODUCT subtotal, before any discount and without add-ons: the base of
    // the discount (TASK-079) AND of the courier's free-delivery threshold
    // (TASK-643). One number, computed once, so the two can never be measured
    // against different bases.
    const subtotal = computeSubtotalString(cart.items);

    // ─── TASK-643 delivery block ───────────────────────────────────────────────
    // Resolve the method (explicit, or derived from npCityRef for every client
    // that predates the method step), validate it against the shop's settings
    // and the delivery × payment matrix, price it SERVER-SIDE, and snapshot it
    // into the address — all before anything is written. Nova Poshta keeps its
    // exact pre-wave pricing, including the TASK-337 not-configured rethrow.
    const delivery = await this.resolveDelivery(dto, paymentMethod, subtotal);
    // ───────────────────────────────────────────────────────────────────────────

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
      // A plain guest never gets here (refused at the top, TASK-2010):
      // `DiscountRedemption.userId` is NOT NULL, and "per customer" is an
      // account. A checkout sign-up does get here — with no account row YET, so
      // the code is validated against the order PHONE (per customer = account
      // OR normalised phone, B-12 тема 2 (г)) and redeemed for the account the
      // transaction creates, which the repository hands the closure as `ownerId`.
      const orderPhone = normalizeUaPhone(dto.shippingAddress.phone);
      const { discount: applied, amount } = await this.discountService.computeDiscount(
        dto.discountCode,
        subtotal,
        userId,
        orderPhone,
      );
      discount = {
        amount,
        code: applied.code,
        redeem: async (orderId, tx, ownerId) => {
          // Defence in depth: an ownerless order cannot hold a redemption.
          if (!ownerId) throw discountAccountRequiredError();
          await this.discountService.redeem(applied.id, ownerId, orderId, tx, orderPhone);
        },
      };
    }
    // ───────────────────────────────────────────────────────────────────────────

    // ─── TASK-338: the guest's key to their own order ──────────────────────────
    // Generated here so the RAW value exists only in this function and the
    // outgoing email; only its SHA-256 is ever persisted (same at-rest pattern as
    // RefreshToken / PasswordResetToken). Without it a guest is blind the moment
    // the cart cookie is gone or they switch device — edge case E-17.
    // TASK-2010: a checkout sign-up gets none — its order belongs to the
    // account, whose session and letters are the buyer's way back.
    const guestToken = actor.type === 'guest' && !signupEmail ? generateGuestToken() : null;
    const guestStatusUrl = guestToken ? this.buildGuestStatusUrl(guestToken) : null;
    // TASK-483: order-independent and token-free, so it is built for account
    // orders too.
    const orderLookupUrl = this.buildOrderLookupUrl();

    // Where the confirmation letter goes. For a guest there is no user row, so it
    // comes from what they typed at checkout — which is also why the email is the
    // only proof we have that the address is theirs.
    const recipient =
      actor.type === 'guest'
        ? { email: actor.contact.email, name: actor.contact.name }
        : { email: user!.email, name: user!.firstName ?? undefined };

    // TASK-677: who the shop's ping names — the buyer, not the parcel's recipient.
    const customerName =
      actor.type === 'guest'
        ? actor.contact.name
        : [user!.firstName, user!.lastName].filter(Boolean).join(' ') || null;

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
        // TASK-643: the typed address plus the delivery snapshot.
        shippingAddress: delivery.shippingAddress,
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
        // ─── TASK-643: the delivery decision ───────────────────────────────────
        // Always explicit, so a 0 is a decided value (pickup, OTHER, a free
        // courier) and never a repository default standing in for "unknown".
        deliveryMethod: delivery.deliveryMethod,
        ...(delivery.pickupPointId ? { pickupPointId: delivery.pickupPointId } : {}),
        shippingCost: delivery.shippingCost,
        ...(discount ? { discount } : {}),
        // ─── TASK-2010: the account a guest asked for ──────────────────────────
        // Written by the repository inside the order transaction, before the
        // order, which then belongs to it — no guest block, no guest token.
        ...(actor.type === 'guest' && signupEmail
          ? {
              account: {
                create: (tx: Prisma.TransactionClient) =>
                  this.checkoutAccounts.createPasswordless(
                    { email: signupEmail, name: actor.contact.name, phone: actor.contact.phone },
                    tx,
                  ),
              },
            }
          : {}),
      },
      // ── TASK-103-F: transactional outbox ──────────────────────────────────
      // Enqueue the order-confirmation email INSIDE the order's transaction so
      // the outbox row and the order commit atomically. The background
      // NotificationOutboxWorker renders + sends it later, so the HTTP response no
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
            // TASK-483: goes to every buyer — the token link above is the fast
            // path, this is the one that survives losing the letter.
            ...(orderLookupUrl ? { orderLookupUrl } : {}),
          },
          tx,
        );
        // TASK-680: the same confirmation on the buyer's Telegram, IN ADDITION to
        // the letter above and in the same transaction. Only the account's chats:
        // a guest connects a chat after the order exists, and gets the summary
        // then (CustomerNotifier.onBindingCreated).
        if (userId) {
          await this.customerNotifier.enqueueOrderConfirmation(
            {
              orderId: created.id,
              total: created.total.toString(),
              itemsCount: countUnits(created),
              deliveryMethod: created.deliveryMethod,
            },
            { userId },
            tx,
          );
        }
        // TASK-677: tell the shop, in the same transaction. TASK-678: only an
        // ON_DELIVERY order is real the moment it is placed — an online one is
        // announced when the provider confirms the money (applyPaymentEvent).
        // The method this checkout decided (absent → ON_DELIVERY, above) — the
        // same value the row was written with.
        if (shopPingAtCreation(paymentMethod)) {
          await this.enqueueShopNewOrder(created, tx, customerName);
        }
        // TASK-2010: the «Задайте пароль» link of the account just created —
        // in the same transaction, so link, letter, account and order commit
        // or roll back together.
        if (signupEmail && created.userId) {
          await this.checkoutAccounts.issueSetupLink(
            { id: created.userId, email: signupEmail },
            tx,
          );
        }
      },
    );

    // TASK-2010: sign the new account in — after the commit, so a failed
    // checkout never mints a session for an account that does not exist.
    const session =
      signupEmail && order.userId ? await this.startSignupSession(order.userId) : null;

    this.logger.info(
      {
        event: 'order.created',
        orderId: order.id,
        userId: order.userId,
        // Never the raw token, and never the guest's email — both are redacted
        // from logs elsewhere and would defeat the point of hashing at rest.
        guest: guestToken !== null,
        accountCreated: session !== null,
      },
      'Order created',
    );

    return { order: OrderEntity.fromPrisma(order), guestAccessToken: guestToken, session };
  }

  /**
   * The one-click account on a guest's success page (TASK-2010 (д), B-12 тема 2).
   *
   * The access token proves the order is the caller's — the same check, and the
   * same 404 for every failure, as `GET /orders/guest/{token}`. An order that
   * already belongs to an account answers that 404 too (like the guest's
   * Telegram routes). The account is created password-less on the order's
   * e-mail, THIS order is attached in the same transaction, the «Задайте
   * пароль» letter is queued, and the caller is signed in. The address's OTHER
   * guest orders move only once the mailbox is proven (the letter's link).
   *
   * @throws NotFoundException for an unknown/expired token or an owned order
   * @throws BadRequestException for an operator phone order with no e-mail
   * @throws ConflictException 409 `ACCOUNT_EXISTS` when the e-mail has an account
   */
  async createAccountFromGuestOrder(rawToken: string): Promise<{ session: IssuedSession | null }> {
    const order = await this.findOrderByGuestToken(rawToken);

    if (order.userId !== null) {
      throw new NotFoundException('Order not found');
    }
    // TASK-426: an operator may take a phone order without an e-mail.
    const email = order.guestEmail;
    if (!email) {
      throw new BadRequestException('This order has no e-mail to create an account on');
    }

    await this.checkoutAccounts.assertNoAccount(email);

    const userId = await this.orderRepository.assignGuestOrderToNewAccount(
      order.id,
      {
        create: (tx) =>
          this.checkoutAccounts.createPasswordless(
            { email, name: order.guestName ?? null, phone: order.guestPhone ?? null },
            tx,
          ),
      },
      (tx, id) => this.checkoutAccounts.issueSetupLink({ id, email }, tx),
    );

    this.logger.info(
      { event: 'order.guest_account_created', orderId: order.id, userId },
      'Account created from a guest order',
    );

    return { session: await this.startSignupSession(userId) };
  }

  /**
   * Sign in an account a checkout has just COMMITTED (review of S5-API).
   *
   * By now the order and the account exist; a failure to mint the session (the
   * refresh-token insert) must not become a 500 that the buyer retries into a
   * second order or a 409. It is logged loudly and answered without a session —
   * the «Задайте пароль» letter, already queued in the transaction, is the way in.
   */
  private async startSignupSession(userId: string): Promise<IssuedSession | null> {
    try {
      return await this.checkoutAccounts.startSession(userId);
    } catch (err) {
      this.logger.error(
        { event: 'order.signup_session_failed', userId, err },
        'Checkout account committed, but its session could not be opened',
      );
      return null;
    }
  }

  /**
   * Decide how a checkout is delivered and what that costs (TASK-643, plan 184).
   *
   * Four steps, in this order, every one of them before any write:
   *
   *  1. **Resolve.** An explicit `dto.deliveryMethod` is used as is; absent, the
   *     address decides (`npCityRef` → NOVA_POSHTA, else OTHER). That keeps every
   *     pre-TASK-643 client working, with the same NP total as before the wave.
   *  2. **Validate** — {@link checkDeliveryChoice}, shared with the operator's
   *     phone order: enabled method (a derived OTHER excepted, TASK-1097), the
   *     storefront delivery × payment matrix, NP city ref, active pickup point.
   *  3. **Price.** NOVA_POSHTA → the carrier estimate ({@link estimateNpShipping});
   *     everything else → {@link flatShippingCost} on the PRODUCT subtotal.
   *  4. **Snapshot** ({@link buildDeliverySnapshot}). The method, the carrier
   *     and — for pickup — the point's
   *     name and address go into the persisted address JSON, so a later edit of
   *     the point cannot rewrite this order's history. Refs that belong to a
   *     different method (a stray `pickupPointId`, NP refs on a non-NP order) are
   *     dropped rather than persisted as contradictions.
   *
   * @throws BadRequestException with a `DELIVERY_*` code (see order.errors.ts).
   */
  private async resolveDelivery(
    dto: CreateOrderDto,
    paymentMethod: PaymentMethod,
    subtotal: string,
  ): Promise<ResolvedDelivery> {
    const npCityRef = dto.shippingAddress.npCityRef;
    const deliveryMethod = resolveDeliveryMethod({
      deliveryMethod: dto.deliveryMethod,
      npCityRef,
    });

    const { point, courier } = await this.checkDeliveryChoice({
      deliveryMethod,
      explicit: Boolean(dto.deliveryMethod),
      npCityRef,
      pickupPointId: dto.pickupPointId,
      paymentAllowed: isPaymentAllowedForDelivery(deliveryMethod, paymentMethod),
      paymentRefusal: () => deliveryPaymentNotAllowedError(deliveryMethod),
    });

    if (deliveryMethod === DeliveryMethod.NOVA_POSHTA) {
      return {
        deliveryMethod,
        // `checkDeliveryChoice` refused an NP order without a ref.
        shippingCost: await this.estimateNpShipping(npCityRef!),
        shippingAddress: buildDeliverySnapshot(dto.shippingAddress, deliveryMethod),
      };
    }

    const shippingCost = Number(
      flatShippingCost(deliveryMethod, {
        subtotal,
        courierPrice: courier.price,
        courierFreeFrom: courier.freeFrom,
      }),
    );

    return {
      deliveryMethod,
      ...(point ? { pickupPointId: point.id } : {}),
      shippingCost,
      // PICKUP: the server's copy of the point wins over whatever the client
      // typed — the parcel is collected THERE. OTHER books 0 now and the
      // operator quotes later — say so in the record, so no surface renders the
      // 0 as "free delivery" (B-6 §4).
      shippingAddress: buildDeliverySnapshot(dto.shippingAddress, deliveryMethod, {
        point: point ? pickupPointSnapshot(point) : null,
        shippingCostPending: deliveryMethod === DeliveryMethod.OTHER,
      }),
    };
  }

  /**
   * The checks every delivery choice passes, shopper's or operator's
   * (TASK-643, shared since TASK-1973), in this order:
   *
   *  1. the method is enabled in the shop's settings — except an INFERRED OTHER
   *     while Nova Poshta is on (TASK-1097, see below);
   *  2. the delivery × payment matrix admits the payment (the caller passes the
   *     verdict of its own matrix and its own wording of the refusal);
   *  3. NOVA_POSHTA carries a city ref (never a silent 0, «ref ⇔ not OTHER»);
   *  4. PICKUP names an active point — returned, so the caller can freeze it.
   *
   * TASK-1097 (owner decision 2026-10-05): an INFERRED OTHER skips the
   * `otherEnabled` switch. The storefront sends `deliveryMethod` explicitly for
   * every choice the shopper makes on the method step — and OMITS it on exactly
   * one path: Nova Poshta is unreachable and the shopper typed the city by hand.
   * That is a fallback for a carrier outage, not «Інша доставка» chosen from the
   * list, so the owner switching OTHER off must not close it. With NP itself
   * switched off there is no outage to fall back from, and the inferred OTHER is
   * checked like any other.
   *
   * @throws BadRequestException with a `DELIVERY_*` code (see order.errors.ts).
   */
  private async checkDeliveryChoice(input: {
    deliveryMethod: DeliveryMethod;
    explicit: boolean;
    npCityRef?: string | null;
    pickupPointId?: string | null;
    paymentAllowed: boolean;
    paymentRefusal: () => Error;
  }): Promise<{ point: ActivePickupPoint | null; courier: DeliveryMethodSettings['courier'] }> {
    const method = input.deliveryMethod;
    const { enabledMethods, courier } = await this.deliveryService.getMethodSettings();
    const inferredOther =
      !input.explicit &&
      method === DeliveryMethod.OTHER &&
      enabledMethods.includes(DeliveryMethod.NOVA_POSHTA);

    if (!inferredOther && !enabledMethods.includes(method)) {
      throw deliveryMethodUnavailableError(method);
    }
    if (!input.paymentAllowed) {
      throw input.paymentRefusal();
    }
    if (method === DeliveryMethod.NOVA_POSHTA && !input.npCityRef) {
      throw deliveryNpCityRequiredError();
    }
    if (method !== DeliveryMethod.PICKUP) {
      return { point: null, courier };
    }
    return { point: await this.resolvePickupPoint(input.pickupPointId), courier };
  }

  /** An active pickup point by id, or the matching 400 (TASK-643). */
  private async resolvePickupPoint(id: string | null | undefined): Promise<ActivePickupPoint> {
    if (!id) throw deliveryPickupPointRequiredError();
    const point = await this.deliveryService.resolveActivePickupPoint(id);
    if (!point) throw deliveryPickupPointUnavailableError();
    return point;
  }

  /**
   * The Nova Poshta shipping cost for an order (TASK-080), unchanged by TASK-643.
   * A transient courier failure must never block an order, so the fallback to 0
   * stays — but it is a fallback for a BAD MINUTE, not for a bad deployment
   * (TASK-337).
   */
  private async estimateNpShipping(npCityRef: string): Promise<number> {
    try {
      const estimate = await this.deliveryService.estimateShipping(npCityRef);
      return Number(estimate.cost);
    } catch (err) {
      // A missing NP_API_KEY is a deployment defect, not a courier hiccup.
      // Swallowing it here would book a 0.00 shipping cost on every real order
      // — the shop paying for delivery out of its own pocket, silently, with
      // nothing in the logs louder than a warning. Let it out.
      if (isDeliveryNotConfigured(err)) throw err;
      this.logger.warn({ err, npCityRef }, 'Shipping estimate failed at order creation; using 0');
      return 0;
    }
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
   * The storefront page that asks for an order number and a phone (TASK-483).
   *
   * Put in every confirmation letter, guest or account, because it is the one
   * route back that the letter itself is not required for. `STORE_CLIENT_URL` is
   * read without a fallback for the same reason {@link buildGuestStatusUrl}
   * does: a `localhost` default is a link that works in dev and points real
   * customers at their own laptop. No value → no line in the letter, which is
   * honest.
   */
  private buildOrderLookupUrl(): string | null {
    const storeUrl = this.configService.get<string>('STORE_CLIENT_URL');
    return storeUrl ? `${storeUrl.replace(/\/+$/, '')}/orders/status` : null;
  }

  /**
   * Queue the shop's «нове замовлення» Telegram ping (TASK-677) inside the
   * order's transaction `tx` — never on the base client, so the ping and the
   * order commit together or not at all (plan 187, constraint #2).
   *
   * Built from the order row alone, plus the buyer's name when the caller has
   * it (an account's name is not on the row): TASK-678 calls this from the
   * payment path too ({@link shopPingOnPaid}, which reads the account's name
   * before its transaction). Without a name it falls back to the guest contact,
   * then to the recipient on the shipping address.
   */
  private enqueueShopNewOrder(
    order: OrderWithItems,
    tx: Prisma.TransactionClient,
    customerName?: string | null,
  ): Promise<number> {
    const address = (order.shippingAddress ?? null) as Partial<ShippingAddressData> | null;
    const recipientName = [address?.firstName, address?.lastName].filter(Boolean).join(' ');
    return this.shopNotifier.enqueueNewOrder(
      {
        orderId: order.id,
        total: order.total.toString(),
        paymentMethod: order.paymentMethod ?? null,
        deliveryMethod: order.deliveryMethod ?? null,
        itemsCount: countUnits(order),
        customerName: customerName || order.guestName || recipientName || null,
        city: typeof address?.city === 'string' ? address.city : null,
      },
      tx,
    );
  }

  /**
   * The in-transaction hook that announces an ONLINE/INSTALLMENTS order once the
   * provider confirms its payment (TASK-678) — or `undefined` when this event
   * must not ping.
   *
   * Decided here, before the transaction, so the buyer's name is read up front
   * and the payment transaction never waits on a second connection:
   *
   * - only a plan that makes a LIVE order paid ({@link confirmsPaymentOfLiveOrder}).
   *   A success on a CANCELLED order (`PAID_AFTER_CANCEL`) is not a new order:
   *   the money has to go back or the order be revived, and nobody is told about
   *   it yet — that event was not among the three the owner agreed (B-7 №6) and
   *   is filed as its own gap (TASK-1089), not folded in here;
   * - only a method that pings on payment ({@link shopPingOnPaymentConfirmed}).
   *   An ON_DELIVERY order the customer later paid online was announced when it
   *   was placed, and must not be announced twice.
   *
   * The repository re-checks the first condition against the same plan and runs
   * the hook only after its conditional write landed; the hook itself builds the
   * ping from the order it re-read inside that transaction. Idempotency needs
   * nothing extra: a repeat callback is stopped by the PaymentEvent unique
   * index, and a repeat SUCCEEDED on a paid order has no plan at all.
   *
   * The operator's manual receipt (`OrderMoneyService.recordReceipt`) never comes
   * through here — staff are the trigger there, so the shop is not told.
   */
  private async shopPingOnPaid(
    order: PaymentWithOrderRow['order'],
    plan: PaymentApplyPlan,
  ): Promise<((tx: Prisma.TransactionClient, paid: OrderWithItems) => Promise<void>) | undefined> {
    if (!confirmsPaymentOfLiveOrder(plan) || !shopPingOnPaymentConfirmed(order.paymentMethod)) {
      return undefined;
    }
    const customerName = await this.accountDisplayName(order.userId);
    return async (tx, paid) => {
      await this.enqueueShopNewOrder(paid, tx, customerName);
    };
  }

  /**
   * The buyer's name as the checkout ping prints it for an account order (first
   * and last name), so an online order is announced under the same name it would
   * have been at creation. A guest order has no account: `null`, and
   * {@link enqueueShopNewOrder} falls back to the guest contact on the row.
   */
  private async accountDisplayName(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const user = await this.userRepository.findById(userId);
    return user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || null : null;
  }

  /**
   * Read a guest's own order using the token from their confirmation email
   * (TASK-338).
   *
   * The ONLY way a guest reaches their order once the cart cookie is gone or they
   * switch device (edge case E-17). The raw token is hashed before the lookup, so
   * a database leak does not hand out order access.
   *
   * The link expires `GUEST_ORDER_TOKEN_TTL_DAYS` after it was ISSUED. There is
   * still no expiry COLUMN — the issue timestamp plus the configured window is
   * the same information, and inventing a column that must be kept in step with
   * a setting is how the two drift apart.
   *
   * TASK-484: the clock starts at `accessTokenIssuedAt`, falling back to
   * `createdAt` for every order minted before that column existed. Counting from
   * `createdAt` alone was correct only while a token could be issued exactly
   * once, at checkout. Now that an operator can re-issue one (B-5 §4), a
   * rotation performed two months into an order's life would have handed the
   * buyer a link that was already dead when it was pasted into the chat.
   *
   * Every failure — unknown token, expired token, soft-deleted order — answers
   * the same 404. A token that is merely expired must not be distinguishable
   * from one that was never valid, or the endpoint becomes an oracle for
   * guessing tokens.
   */
  async getGuestOrder(rawToken: string): Promise<OrderEntity> {
    return OrderEntity.fromPrisma(await this.findOrderByGuestToken(rawToken));
  }

  /**
   * The id of the order an access token proves (TASK-1965) — what the guest's
   * returns routes act on.
   *
   * Exactly the resolution of {@link getGuestOrder}, and deliberately NOT
   * {@link resolveGuestOnlyOrderId}: an order that belongs to an account is
   * accepted. An operator's phone order for a signed-up customer carries a token
   * too (B-5 §4), and that buyer files a return from the link they were sent,
   * the way B-12 §1 decided. The return records the GUEST_LINK channel either
   * way, so the operator still sees which door it came through.
   */
  async resolveGuestOrderId(rawToken: string): Promise<string> {
    return (await this.findOrderByGuestToken(rawToken)).id;
  }

  /**
   * The one token check behind every guest-link route: hash, soft-delete filter
   * (in the repository), and the TTL counted from `accessTokenIssuedAt ??
   * createdAt`. Every failure is the same `NotFoundException('Order not found')`.
   */
  private async findOrderByGuestToken(rawToken: string): Promise<OrderWithItems> {
    const order = await this.orderRepository.findByAccessTokenHash(hashGuestToken(rawToken));

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const ttlDays = this.configService.get<number>(
      'GUEST_ORDER_TOKEN_TTL_DAYS',
      DEFAULT_GUEST_TOKEN_TTL_DAYS,
    );
    const issuedAt = order.accessTokenIssuedAt ?? order.createdAt;
    const expiresAt = issuedAt.getTime() + ttlDays * MS_PER_DAY;
    if (Date.now() > expiresAt) {
      this.logger.info(
        { event: 'order.guest_token_expired', orderId: order.id },
        'Guest order link used after it expired',
      );
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  /**
   * The id of a GUEST order, proven by its access token (TASK-679) — what the
   * guest's Telegram routes act on.
   *
   * The same lookup, hashing and expiry as {@link getGuestOrder}, plus one more
   * refusal: an order that belongs to an account (claimed after checkout, or
   * placed signed-in and issued a token by an operator). Its notifications are
   * the account's to manage from the profile, behind a session; letting a link
   * that may have been forwarded attach a chat to it would bypass that. Every
   * refusal is the same 404, so the route tells a stranger nothing.
   */
  async resolveGuestOnlyOrderId(rawToken: string): Promise<string> {
    const order = await this.getGuestOrder(rawToken);
    if (order.userId !== null) {
      throw new NotFoundException('Order not found');
    }
    return order.id;
  }

  /**
   * Find an order from the public form: order number + phone (TASK-483).
   *
   * ── Why this exists next to the emailed link ──────────────────────────────
   * Before it, an order could be seen exactly one way — the link in the
   * confirmation letter — and that is the single easiest thing in the flow to
   * lose: a deleted mail, a mistyped address, a spam folder, or an order an
   * operator took over the phone, which had no letter at all. "Seeing your order
   * must be possible in more than one way" is the principle B-5 was decided on.
   *
   * ── One 404 for every kind of failure ─────────────────────────────────────
   * A number that is not eight hex characters, a number nobody has, the right
   * number with the wrong phone, a soft-deleted order — all of them answer the
   * same `404`, produced by the same line of code. Anything else turns this into
   * an oracle: a distinguishable "well-formed but unknown" would tell someone
   * walking through numbers that they are getting warmer, and a distinguishable
   * "right number, wrong phone" would confirm an order exists to anyone who
   * merely read the number off a parcel label.
   *
   * ── What the caller gets back ─────────────────────────────────────────────
   * A LIST, not a single order. An eight-character prefix of a UUID can collide,
   * and when it does, every match also had to match the phone — so they all
   * belong to the same person and showing them is not a leak (B-5 §1).
   *
   * @throws NotFoundException — always, for every failure mode.
   */
  async lookupOrders(dto: OrderLookupDto): Promise<PublicOrderEntity[]> {
    // Normalised again here rather than trusted from the DTO: the transform is a
    // convenience for the HTTP boundary, and this method is also reachable from
    // tests and future callers that never went through a validation pipe.
    const number = normalizeOrderNumber(dto.number);
    const phone = normalizeUaPhone(dto.phone);

    // The one place a short or malformed input is rejected — and it is rejected
    // as "not found", not as a validation error. Searching on a 3-character
    // prefix would return other people's orders; see the repository docblock.
    if (!ORDER_NUMBER_PATTERN.test(number) || phone.length === 0) {
      throw new NotFoundException('Order not found');
    }

    const rows = await this.orderLookupRepository.findByNumberAndPhone(number, phone);

    if (rows.length === 0) {
      // Logged without the number and without the phone: this endpoint is
      // unauthenticated, so its failures are exactly the data an attacker would
      // like written down for them. The count is enough to alarm on.
      this.logger.info({ event: 'order.lookup_miss' }, 'Public order lookup found nothing');
      throw new NotFoundException('Order not found');
    }

    this.logger.info(
      { event: 'order.lookup_hit', matches: rows.length },
      'Public order lookup matched',
    );

    return rows.map((row) => PublicOrderEntity.fromRow(row));
  }

  /**
   * Attach a shopper's earlier guest orders to their account (TASK-338, 485).
   *
   * The guest columns are deliberately kept: they record what was actually typed
   * at checkout, and the emailed status link goes on working. Idempotent — the
   * repository matches only `userId: null` rows, so an order already claimed can
   * never be re-pointed, and an address with nothing behind it claims zero.
   *
   * ── ONE CALL SITE, AND IT MUST STAY THAT WAY ────────────────────────────────
   * Wired to `EmailVerificationService.confirm`, through
   * `GUEST_ORDER_CLAIM_PORT` (the port exists because injecting OrderService
   * into AuthModule closes a module cycle).
   *
   * **Do not call this from any path that has not PROVEN the address.** It moves
   * another party's orders — with their phone, delivery address and totals —
   * onto the calling account, so the only thing standing between an attacker and
   * a stranger's data is the proof that they read the mail sent to that address.
   * Registration is not that proof: an account can sign in with an unverified
   * address. Neither is an authenticated read — `getOrders` does not look at
   * `emailVerifiedAt`, so claiming from there would hand the orders to whoever
   * typed the address.
   *
   * Earlier revisions of this docblock proposed exactly that ("claim lazily from
   * the order side"); it was written before TASK-485 chose the port, and it is
   * recorded here only so the idea is not re-proposed as new.
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
  async getOrders(userId: string, query: OrderListQueryDto): Promise<Paginated<OrderEntity>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const { orders, total } = await this.orderRepository.findByUserId(userId, query);

    return {
      items: orders.map((order) => OrderEntity.fromPrisma(order)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin — list orders across ALL users (paginated, newest first) with
   * optional `userId`, `status`, and created-at date-range filters. No
   * ownership scoping; authorization (ADMIN role) is enforced at the controller.
   */
  async adminGetAllOrders(query: AdminOrderListQueryDto): Promise<Paginated<OrderEntity>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const { orders, total } = await this.orderRepository.findAll(query);

    return {
      // TASK-336: admin reads opt into the operator-only fields.
      items: orders.map((order) => OrderEntity.fromPrisma(order, { includeInternal: true })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Admin — facet counts for the order list's filter chips (TASK-648): how many
   * orders of each delivery method match every active filter except the method
   * filter itself (see `OrderRepository.countByDeliveryMethod`). All four keys
   * are always present.
   */
  async adminGetOrderFacets(query: AdminOrderExportQueryDto): Promise<AdminOrderFacets> {
    return { deliveryMethod: await this.orderRepository.countByDeliveryMethod(query) };
  }

  /**
   * Admin — build the order CSV for the CURRENT filter set (TASK-425).
   *
   * Same filters as the list, no pagination, capped at
   * {@link ORDER_EXPORT_MAX_ROWS} newest-first rows. The leading BOM is not
   * decoration: without it Excel on Windows reads a UTF-8 CSV as the system
   * codepage, and every Ukrainian customer name in the file arrives as mojibake
   * — which looks like OUR data being corrupt, not the spreadsheet's guess. It
   * comes from {@link buildCsvDocument}, shared with every export (TASK-691).
   */
  async adminExportOrdersCsv(query: AdminOrderExportQueryDto): Promise<string> {
    const rows = await this.orderRepository.findAllForExport(query, ORDER_EXPORT_MAX_ROWS);

    return buildCsvDocument([
      ORDER_EXPORT_HEADER.join(','),
      ...rows.map((row) => this.toCsvRow(row)),
    ]);
  }

  /** One export row → one CSV line, in {@link ORDER_EXPORT_HEADER} order. */
  private toCsvRow(row: AdminOrderExportRow): string {
    // An account order and a guest order carry the customer in two different
    // places (TASK-338). The CSV has ONE customer column set, so the type column
    // says which record the contact came from — a guest has no account to look
    // up, and that is the operator's first question.
    const isGuest = row.user == null;
    const accountName = row.user
      ? [row.user.firstName, row.user.lastName].filter(Boolean).join(' ')
      : '';
    const address = (row.shippingAddress as ShippingAddressData | null) ?? null;

    return (
      [
        // The number the customer reads off their email — uppercased id prefix,
        // exactly what the storefront and the admin search show.
        row.id.slice(0, 8).toUpperCase(),
        row.id,
        row.createdAt.toISOString(),
        row.status,
        row.paymentStatus,
        row.paymentMethod ?? '',
        DELIVERY_METHOD_EXPORT_LABEL[row.deliveryMethod] ?? '',
        row.paidAt ? row.paidAt.toISOString() : '',
        isGuest ? 'GUEST' : 'ACCOUNT',
        isGuest ? (row.guestName ?? '') : accountName,
        isGuest ? (row.guestEmail ?? '') : (row.user?.email ?? ''),
        isGuest ? (row.guestPhone ?? '') : (row.user?.phone ?? ''),
        address?.city ?? '',
        String(row._count.items),
        row.subtotal.toString(),
        toTwoDecimals(row.addonsTotal ?? '0'),
        row.discount.toString(),
        row.discountCode ?? '',
        row.shippingCost.toString(),
        row.tax.toString(),
        row.total.toString(),
        row.trackingNumber ?? '',
      ]
        // `toSingleCsvLine` FIRST, then the escape. The flattening is what makes
        // "one order = one physical line" true rather than merely assumed: the
        // admin table counts the exported rows by splitting the file on `\r\n` to
        // detect a capped export, and `customerName`/`city` are free text that a
        // shopper can put a newline in (both DTOs impose a max length and a trim,
        // nothing more). `escapeCsvField` would quote such a value perfectly
        // correctly and the record would still span three lines, inflating the
        // count past the cap until the truncation warning is skipped — a green
        // "done" toast over a file missing every order past row 5000.
        //
        // `escapeCsvField` then neutralises a value a spreadsheet would EXECUTE
        // (`=cmd|'/c calc.exe'!A0` typed into a checkout name field) before
        // quoting it. See the helper: quoting alone is not a mitigation.
        .map((value) => escapeCsvField(toSingleCsvLine(value)))
        .join(',')
    );
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
   *
   * TASK-788: a move to SHIPPED of an ONLINE-paid order whose payment is still
   * PENDING/FAILED writes its STATUS history row with `note = SHIPPED_UNPAID`.
   * The note is decided from the order's own payment state, never from the
   * client: a request that skipped the admin's confirmation dialog must not be
   * able to ship unpaid without a trace, and a confirmation sent for an order
   * that has meanwhile been paid must not write a false one.
   * `confirmUnpaidShipment` is the operator's acknowledgment from that dialog;
   * it is logged with the event, next to what the server actually found.
   */
  async updateStatus(
    orderId: string,
    status: OrderStatus,
    changedBy: string | null,
    options: { expectedUpdatedAt?: Date; confirmUnpaidShipment?: boolean } = {},
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

    // The cross-rule of B-1 §1, asked from the ORDER side (review of plan 180).
    // Without it the pair the payment door refuses — a live order whose money is
    // recorded as fully returned — was reachable in one ordinary click, and then
    // could not be repaired from either side.
    if (!this.isOrderTargetReachable(existing.paymentStatus, status)) {
      this.logger.warn(
        {
          event: 'order.revive_refunded_rejected',
          orderId,
          from: existing.status,
          to: status,
          paymentStatus: existing.paymentStatus,
          changedBy,
        },
        'Rejected reviving an order whose payment is recorded as fully refunded',
      );
      throw reviveRefundedPaymentError(status);
    }

    // TASK-228: reviving an order whose cancellation already credited its stock
    // back (restockedAt set) into a live status must re-reserve that stock, or
    // a later re-cancel would credit it a second time. TASK-627: the same holds
    // for a LIVE order whose hold ORDER_RESERVATION_EXPIRY=release gave back —
    // the operator moving it on (PENDING → CONFIRMED, …) re-takes the units
    // first, or gets the 409 that says they are gone. (REFUNDED is derived and
    // never a target here — TASK-1969.) The repository re-reserves with the same conditional-decrement
    // guard as order creation, so an impossible revive gets a 409 and the
    // order keeps its terminal status.
    // `!= null` (not `!== null`): only an actual restock timestamp marks the
    // order as needing a re-reserve — fixtures/rows without the field must
    // behave like unflagged orders.
    const isRevive = existing.restockedAt != null && status !== OrderStatus.CANCELLED;
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
        'Released stock re-reserved as the order moved to a live status',
      );
      return OrderEntity.fromPrisma(revived);
    }

    // Pre-shipment cancellation: return the reserved stock to inventory and
    // evict product caches in one transaction (reuses the customer-cancel path).
    // Post-shipment cancels and refunds are deliberately NOT auto-restocked —
    // the physical return must be received and re-stocked by hand (TASK-124).
    // TASK-627: a live order may now carry `restockedAt` (ORDER_RESERVATION_EXPIRY
    // =release gave its hold back). It still goes through cancelAndRestock, which
    // owns the "never credit twice" rule — it credits no stock for a released
    // hold — and gives the promo slot back as for any other cancel.
    if (shouldAutoRestock(existing.status, status)) {
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
    // the order money ledger (R2 A3). (Previously TASK-123 auto-derived PAID here.)
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
    const shippedUnpaid = status === OrderStatus.SHIPPED && isUnconfirmedOnlinePayment(existing);
    const order = await this.orderRepository.updateStatus(
      orderId,
      existing.status,
      status,
      existing.paymentStatus,
      changedBy,
      {
        evictProductStockCaches: crossesPreShipmentBoundary,
        expectedUpdatedAt: options.expectedUpdatedAt,
        ...(shippedUnpaid ? { note: OrderHistoryNote.SHIPPED_UNPAID } : {}),
      },
    );

    if (shippedUnpaid) {
      this.logger.info(
        {
          event: 'order.shipped_unpaid',
          orderId,
          paymentStatus: existing.paymentStatus,
          // Whether the operator went through the confirmation dialog — the note
          // is written either way, from the payment state above.
          confirmedByOperator: options.confirmUnpaidShipment === true,
          changedBy,
        },
        'Order shipped without a confirmed online payment',
      );
    }

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
   * The delivery address (TASK-341) is one more field of the same edit
   * (TASK-786): one call, one version check, one conditional write in the
   * repository — so an address + waybill save either lands whole or not at all,
   * and the waybill half can no longer slip past the version check. The
   * address keeps its own rule: pre-shipment only. Once the parcel is with the
   * courier the waybill's address is the one that counts, and editing the order
   * would only make the record disagree with reality.
   *
   * @throws NotFoundException when the order does not exist.
   * @throws ConflictException `ORDER_STALE` on a concurrent edit, or when the
   *   address is edited on an order that has already shipped.
   * @throws BadRequestException `ORDER_VERSION_REQUIRED` for a delivery edit
   *   (address, method, point, cost) without `expectedUpdatedAt` (TASK-1973).
   */
  async adminUpdateDetails(
    orderId: string,
    fields: {
      trackingNumber?: string | null;
      internalNotes?: string | null;
      shippingAddress?: AddressDto;
      deliveryMethod?: DeliveryMethod;
      pickupPointId?: string;
      shippingCost?: number;
    },
    options: { expectedUpdatedAt?: Date; changedBy?: string } = {},
  ): Promise<OrderEntity> {
    const existing = await this.orderRepository.findById(orderId);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    this.assertFresh(existing, options.expectedUpdatedAt);

    const { shippingAddress, deliveryMethod, pickupPointId, shippingCost, ...plain } = fields;
    const deliveryEdit =
      shippingAddress !== undefined ||
      deliveryMethod !== undefined ||
      pickupPointId !== undefined ||
      shippingCost !== undefined;

    if (deliveryEdit && !PRE_SHIPMENT_STATUSES.has(existing.status)) {
      throw new ConflictException(
        'The delivery address can only be changed before the order ships',
      );
    }
    // The method change, the payment-matrix verdict and the price below are all
    // decided from `existing`; the write must be guarded by that same version,
    // or a concurrent edit could be re-priced from a state that is gone.
    if (deliveryEdit && !options.expectedUpdatedAt) {
      throw orderVersionRequiredError();
    }

    const write = deliveryEdit
      ? {
          ...plain,
          ...(await this.resolveDeliveryEdit(existing, {
            shippingAddress,
            deliveryMethod,
            pickupPointId,
            shippingCost,
          })),
        }
      : plain;

    // A waybill appearing on an order that ALREADY shipped is the second half of
    // the common workflow: the operator marks the parcel gone, then the courier
    // hands over the number. The customer was told "on its way" without a number,
    // so tell them the number now. Only null → value triggers it; correcting a
    // typo does not re-notify, and neither does clearing the field.
    const gainedTracking =
      fields.trackingNumber !== undefined &&
      fields.trackingNumber !== null &&
      !existing.trackingNumber;

    const order = await this.orderRepository.updateDetails(orderId, write, options);

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
   * What an operator's delivery edit writes (TASK-1973, TASK-1020, TASK-1806,
   * AD-ORD-86): the rebuilt snapshot always, plus the method, the point and the
   * shipping cost when they change.
   *
   * ── The snapshot is REBUILT, never replaced ────────────────────────────────
   * The admin form sends a plain address. Written as is, it used to wipe the
   * method, the carrier, the frozen pickup point and the «to be quoted» flag
   * (TASK-1020). Now the address is only the contact/destination part, and the
   * snapshot is built from it the same way checkout builds it. An unchanged
   * pickup point is read back from the old snapshot rather than looked up again:
   * the buyer was promised THAT point, even if it has been edited since.
   *
   * ── Money moves only on purpose ────────────────────────────────────────────
   * An address edit within the same method never re-prices the order (TASK-1020:
   * the buyer has already seen the amount). The cost changes only when the
   * method does (NP/PICKUP → 0, COURIER → the flat price, OTHER → the agreed cost
   * or 0 «to be quoted»), or when an OTHER order is given its agreed cost. The
   * repository then recomputes the total and the balance under the order lock.
   *
   * A changed method is checked like a new order's (enabled, admin payment
   * matrix with the order's own payment method, NP ref, active point); an
   * unchanged one is not — editing a phone number must not fail because the
   * owner has since switched the method off.
   */
  private async resolveDeliveryEdit(
    existing: OrderWithItems,
    edit: {
      shippingAddress?: AddressDto;
      deliveryMethod?: DeliveryMethod;
      pickupPointId?: string;
      shippingCost?: number;
    },
  ): Promise<{
    shippingAddress: ShippingAddressData;
    deliveryMethod?: DeliveryMethod;
    pickupPointId?: string | null;
    shippingCost?: number;
  }> {
    const current = (existing.shippingAddress ?? {}) as Partial<ShippingAddressData>;
    const currentMethod =
      existing.deliveryMethod ??
      current.deliveryMethod ??
      resolveDeliveryMethod({ npCityRef: current.npCityRef });
    const method = edit.deliveryMethod ?? currentMethod;
    const methodChanged = method !== currentMethod;
    const source = edit.shippingAddress ?? current;

    if (edit.shippingCost !== undefined && method !== DeliveryMethod.OTHER) {
      throw deliveryShippingCostNotAllowedError();
    }

    let pickup: PickupPointSnapshot | null = null;
    let pickupPointId: string | null | undefined;
    let courier: DeliveryMethodSettings['courier'] | null = null;

    if (methodChanged) {
      const paymentMethod = existing.paymentMethod ?? PaymentMethod.ON_DELIVERY;
      const choice = await this.checkDeliveryChoice({
        deliveryMethod: method,
        explicit: true,
        npCityRef: source.npCityRef,
        pickupPointId: edit.pickupPointId,
        paymentAllowed: isPaymentAllowedForAdminDelivery(method, paymentMethod),
        paymentRefusal: () => manualOrderDeliveryPaymentNotAllowedError(method),
      });
      courier = choice.courier;
      pickup = choice.point ? pickupPointSnapshot(choice.point) : null;
      pickupPointId = choice.point?.id ?? null;
    } else if (method === DeliveryMethod.NOVA_POSHTA) {
      // «ref ⇔ not OTHER» (TASK-1020): an NP order keeps a city to ship to.
      if (!source.npCityRef) throw deliveryNpCityRequiredError();
    } else if (method === DeliveryMethod.PICKUP) {
      if (edit.pickupPointId && edit.pickupPointId !== existing.pickupPointId) {
        const point = await this.resolvePickupPoint(edit.pickupPointId);
        pickup = pickupPointSnapshot(point);
        pickupPointId = point.id;
      } else {
        pickup = pickupPointFromSnapshot(current);
      }
    }

    let shippingCost: number | undefined;
    if (methodChanged) {
      shippingCost = this.operatorShippingCost(
        method,
        courier!,
        toCents(existing.subtotal),
        edit.shippingCost,
      );
    } else if (edit.shippingCost !== undefined) {
      shippingCost = edit.shippingCost;
    }

    // «To be quoted» until someone quotes it: set by a move to OTHER without a
    // cost, cleared by a cost, otherwise carried over as it was.
    const shippingCostPending =
      shippingCost !== undefined
        ? edit.shippingCost === undefined
        : current.shippingCostPending === true;

    return {
      shippingAddress: buildDeliverySnapshot(source, method, {
        point: pickup,
        shippingCostPending,
      }),
      ...(methodChanged ? { deliveryMethod: method } : {}),
      ...(pickupPointId !== undefined ? { pickupPointId } : {}),
      ...(shippingCost !== undefined ? { shippingCost } : {}),
    };
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
   * ── TASK-484: the buyer gets a way to see it ──────────────────────────────
   * A phone order used to be the one kind of order its own buyer could not look
   * at: no account to sign into, no token, no confirmation letter. It now gets
   * exactly the same access token guest checkout mints — same generator, same
   * SHA-256 at rest — and, when the customer dictated an email, the same
   * confirmation letter.
   *
   * The RAW token exists only inside this call, so it is returned alongside the
   * order rather than stored: the operator either copies the link into the chat
   * they are already in, or re-issues one later from the order card. Nothing
   * anywhere can hand the same string out a second time.
   *
   * @throws BadRequestException when neither an account nor contact details were
   *   given, a product is unknown or withdrawn, or stock is short.
   * @throws ForbiddenException when the named account is deactivated.
   */
  async adminCreateOrder(
    dto: CreateManualOrderDto,
    adminUserId: string,
  ): Promise<ManualOrderResult> {
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

    const paymentMethod = dto.paymentMethod ?? PaymentMethod.ON_DELIVERY;
    // TASK-1973: the operator names the method; absent, the address decides as
    // it did since TASK-643. Every check runs before anything is read or
    // reserved — TASK-1021: the delivery × payment matrix is a money invariant,
    // and an OTHER phone order paid online would send the customer a link for an
    // amount whose shipping nobody has quoted yet.
    const delivery = await this.resolveManualDelivery(dto, paymentMethod);

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.orderRepository.findOrderableProducts(productIds);
    const byId = new Map(products.map((product) => [product.id, product]));

    const items = dto.items.map((line) => {
      const product = byId.get(line.productId);

      if (!product) {
        throw new BadRequestException('One of the selected products no longer exists');
      }
      if (!product.isActive || !isCategoryOnSale(product.category)) {
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

    // TASK-484: minted here, hashed on the way to the database, returned raw to
    // the caller exactly once. Same two helpers guest checkout uses — "nothing
    // new invented" is the decision (B-5 §4), and a second token scheme would be
    // a second thing to get wrong.
    const accessToken = generateGuestToken();
    const accessUrl = this.buildGuestStatusUrl(accessToken);

    const order = await this.orderRepository.createManual(
      {
        userId: dto.userId ?? null,
        ...(dto.contact ? { guest: dto.contact } : {}),
        accessTokenHash: hashGuestToken(accessToken),
        items,
        shippingAddress: delivery.shippingAddress,
        deliveryMethod: delivery.deliveryMethod,
        ...(delivery.pickupPointId ? { pickupPointId: delivery.pickupPointId } : {}),
        shippingCost: delivery.price(sumLineCents(items)),
        ...(dto.notes ? { notes: dto.notes } : {}),
        ...(dto.internalNotes ? { internalNotes: dto.internalNotes } : {}),
        ...(dto.paymentMethod ? { paymentMethod: dto.paymentMethod } : {}),
        // An operator can take a phone order and send a payment link, so a manual
        // order needs the same reservation deadline as a storefront one — its
        // stock must expire rather than be held forever by a link nobody opened.
        reservationExpiresAt: this.resolveReservationDeadline(paymentMethod),
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

    const entity = OrderEntity.fromPrisma(order, { includeInternal: true });

    // TASK-484: if the customer dictated an address, the same confirmation
    // letter a self-service checkout sends — with the same status link in it.
    // Enqueued AFTER the order committed rather than inside its transaction,
    // unlike `createOrder`: `createManual` does not accept a post-commit hook,
    // and for an operator who is on the phone with the buyer, an order that
    // exists with no letter is a recoverable inconvenience ("I'll re-send it")
    // while an order that failed to be created is not.
    const recipientEmail = dto.contact?.email;
    if (recipientEmail) {
      const lookupUrl = this.buildOrderLookupUrl();
      await this.mailOutbox.enqueueOrderConfirmation({
        to: recipientEmail,
        order: entity,
        ...(dto.contact?.name ? { customerName: dto.contact.name } : {}),
        ...(accessUrl ? { orderStatusUrl: accessUrl } : {}),
        ...(lookupUrl ? { orderLookupUrl: lookupUrl } : {}),
      });
    }

    // TASK-680: an order taken for an ACCOUNT also reaches the chats that account
    // connected — after the commit, like the letter above, and for the same
    // reason. A guest phone order has no chat yet.
    if (dto.userId) {
      await this.enqueueCustomerConfirmationAfterCommit(order, dto.userId);
    }

    return { order: entity, accessUrl };
  }

  /**
   * How a phone order is delivered and what that adds to its total (TASK-1973,
   * TASK-1019). The same checks and the same snapshot as a checkout
   * ({@link checkDeliveryChoice}, {@link buildDeliverySnapshot}); the price
   * differs on purpose:
   *
   * - NOVA_POSHTA → 0. The buyer pays the carrier at the branch, so its
   *   estimate is not part of what they owe the shop (owner decision B-13).
   * - PICKUP → 0; COURIER → the flat courier price on the goods subtotal.
   * - OTHER → the cost the operator agreed with the customer, or 0 flagged
   *   «to be quoted» (`shippingCostPending`) when none was entered.
   *
   * The price is returned as a function of the goods subtotal because the
   * courier's free threshold needs it, and the lines are only priced after
   * these checks have run.
   */
  private async resolveManualDelivery(
    dto: CreateManualOrderDto,
    paymentMethod: PaymentMethod,
  ): Promise<{
    deliveryMethod: DeliveryMethod;
    pickupPointId?: string;
    shippingAddress: ShippingAddressData;
    price: (subtotalCents: number) => number;
  }> {
    const npCityRef = dto.shippingAddress.npCityRef;
    const deliveryMethod = resolveDeliveryMethod({ deliveryMethod: dto.deliveryMethod, npCityRef });

    if (dto.shippingCost !== undefined && deliveryMethod !== DeliveryMethod.OTHER) {
      throw deliveryShippingCostNotAllowedError();
    }

    const { point, courier } = await this.checkDeliveryChoice({
      deliveryMethod,
      explicit: Boolean(dto.deliveryMethod),
      npCityRef,
      pickupPointId: dto.pickupPointId,
      paymentAllowed: isPaymentAllowedForAdminDelivery(deliveryMethod, paymentMethod),
      paymentRefusal: () => manualOrderDeliveryPaymentNotAllowedError(deliveryMethod),
    });

    return {
      deliveryMethod,
      ...(point ? { pickupPointId: point.id } : {}),
      shippingAddress: buildDeliverySnapshot(dto.shippingAddress, deliveryMethod, {
        point: point ? pickupPointSnapshot(point) : null,
        shippingCostPending: dto.shippingCost === undefined,
      }),
      price: (subtotalCents) =>
        this.operatorShippingCost(deliveryMethod, courier, subtotalCents, dto.shippingCost),
    };
  }

  /** The operator's price for `method` — see {@link resolveManualDelivery}. */
  private operatorShippingCost(
    method: DeliveryMethod,
    courier: DeliveryMethodSettings['courier'],
    subtotalCents: number,
    agreedCost: number | undefined,
  ): number {
    if (method === DeliveryMethod.OTHER) return agreedCost ?? 0;
    if (method !== DeliveryMethod.COURIER) return 0;
    return Number(
      flatShippingCost(method, {
        subtotal: centsToString(subtotalCents),
        courierPrice: courier.price,
        courierFreeFrom: courier.freeFrom,
      }),
    );
  }

  /**
   * The operator's phone order, told to the account's Telegram (TASK-680).
   * Never throws: the order is committed and the operator is on the phone — a
   * failed enqueue is logged, not turned into a 500 for an order that exists.
   */
  private async enqueueCustomerConfirmationAfterCommit(
    order: OrderWithItems,
    userId: string,
  ): Promise<void> {
    try {
      await this.customerNotifier.enqueueOrderConfirmation(
        {
          orderId: order.id,
          total: order.total.toString(),
          itemsCount: countUnits(order),
          deliveryMethod: order.deliveryMethod,
        },
        { userId },
      );
    } catch (err) {
      this.logger.error(
        { err, event: 'order.customer_telegram_failed', orderId: order.id },
        'Failed to queue the customer’s Telegram confirmation; the order stands',
      );
    }
  }

  /**
   * Admin — issue a fresh order-access link for a buyer, invalidating the old
   * one (TASK-484).
   *
   * ── Why this action exists at all ─────────────────────────────────────────
   * The raw token lives for the duration of one request; the database holds only
   * its SHA-256. So there is no "show me the link again" — there is only "make a
   * new one". That is a deliberate consequence of hashing at rest, not a gap: a
   * system that could re-display the link would be a system storing it.
   *
   * ── What rotating costs, and why it is still right ────────────────────────
   * The previous link stops working the moment this returns. That is the point
   * when a buyer says "I forwarded it to the wrong person", and the price when
   * they simply lost it — so the UI says so before the operator presses it.
   *
   * No audit call here: every mutating route under `@RequirePermission` is
   * recorded by `AuditInterceptor`, and the response it inspects carries only
   * the order id, never the token.
   *
   * ── Guest orders only (TASK-623) ──────────────────────────────────────────
   * The link is a 60-day bearer credential for the whole order, delivery and
   * billing address included, and operators paste it into chats that other
   * people will read later. A guest has no other way in, so for them the risk
   * buys something. An account holder already sees the order in their cabinet,
   * behind a password — minting a bearer link for them is pure exposure. That
   * includes a guest order later claimed by a registering account: once
   * `userId` is set, the cabinet is the way in. Refused BEFORE the rotation, so
   * the attempt does not kill a link the buyer may still be using.
   *
   * @throws NotFoundException when no such order exists (or it is soft-deleted).
   * @throws ConflictException when the order belongs to an account.
   */
  async issueOrderAccessLink(orderId: string): Promise<{ url: string; issuedAt: Date }> {
    const existing = await this.orderRepository.findById(orderId);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    if (existing.userId !== null) {
      throw new ConflictException(
        'Order links are issued for guest orders only — this order belongs to an account, ' +
          'and the customer sees it in their account cabinet',
      );
    }

    const rawToken = generateGuestToken();
    const url = this.buildGuestStatusUrl(rawToken);

    if (!url) {
      // STORE_CLIENT_URL is missing, so any link we minted would point nowhere.
      // Refuse BEFORE writing: rotating the hash here would kill the buyer's
      // working link and hand the operator nothing in exchange.
      throw new BadRequestException(
        'The storefront address is not configured, so an order link cannot be issued',
      );
    }

    const issuedAt = await this.orderRepository.rotateAccessToken(
      orderId,
      hashGuestToken(rawToken),
    );

    // Never the token, and never the URL that contains it.
    this.logger.info(
      { event: 'order.access_link_issued', orderId },
      'A fresh order-access link was issued; the previous one no longer works',
    );

    return { url, issuedAt };
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
   *
   * TASK-680: the buyer's Telegram chats are told too — the account's and the
   * order's own (a guest who connected from the success page), one message per
   * chat. Independent of the letter: an order with no e-mail on file still
   * reaches a connected chat, and a failure of one channel never stops the other.
   */
  private async notifyShipped(order: OrderWithItems): Promise<void> {
    await this.notifyShippedByEmail(order);
    await this.notifyShippedByTelegram(order);
  }

  /** The «відправлено» letter (TASK-335). Never throws — see {@link notifyShipped}. */
  private async notifyShippedByEmail(order: OrderWithItems): Promise<void> {
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

  /** «Відправлено» to the buyer's Telegram chats (TASK-680). Never throws. */
  private async notifyShippedByTelegram(order: OrderWithItems): Promise<void> {
    try {
      await this.customerNotifier.enqueueOrderShipped(
        {
          orderId: order.id,
          trackingNumber: order.trackingNumber ?? null,
          deliveryMethod: order.deliveryMethod ?? null,
        },
        { userId: order.userId, orderId: order.id },
      );
    } catch (err) {
      this.logger.error(
        { err, event: 'order.shipped_telegram_failed', orderId: order.id },
        'Failed to queue the Telegram shipment notice; the order status change stands',
      );
    }
  }

  /**
   * «Оплату не отримано, замовлення скасовано, товар повернуто в продаж»
   * (TASK-352 (b), decision B-11 №2).
   *
   * Called by the payment reconcile worker AFTER its `updateStatus(CANCELLED)`
   * resolved — so the letter follows a cancellation that really happened, and a
   * cancel that threw (lost race, already restocked) sends nothing. One letter,
   * no reminder before the deadline.
   *
   * Never throws: the cancellation is committed and the stock is back on sale;
   * a failed enqueue is logged, not retried by failing the worker's batch.
   */
  async notifyPaymentExpired(order: OrderEntity): Promise<void> {
    try {
      const recipient = await this.orderRepository.findRecipient(order.id);

      if (!recipient) {
        this.logger.warn(
          { event: 'order.payment_expired_notice_no_recipient', orderId: order.id },
          'Order cancelled for non-payment but no email address is on file — no notice sent',
        );
        return;
      }

      const storeUrl = this.configService.get<string>('STORE_CLIENT_URL')?.replace(/\/+$/, '');

      await this.mailOutbox.enqueueOrderPaymentExpired({
        to: recipient.email,
        ...(recipient.name ? { customerName: recipient.name } : {}),
        order: {
          id: order.id,
          items: order.items.map((item) => ({
            name: item.productName,
            quantity: item.quantity,
            ...(storeUrl ? { url: `${storeUrl}/products/${item.productSlug}` } : {}),
          })),
        },
        ...(storeUrl ? { reorderUrl: `${storeUrl}/catalog` } : {}),
      });

      this.logger.info(
        { event: 'order.payment_expired_notice_enqueued', orderId: order.id },
        'Payment-expired notice enqueued',
      );
    } catch (err) {
      this.logger.error(
        { err, event: 'order.payment_expired_notice_failed', orderId: order.id },
        'Failed to enqueue the payment-expired notice; the cancellation stands',
      );
    }
  }

  /**
   * ORDER_RESERVATION_EXPIRY=release (TASK-627): give an overdue unpaid order's
   * stock back and leave the order itself alive.
   *
   * Called by the payment reconcile worker instead of `updateStatus(CANCELLED)`.
   * The status is not touched, the payment attempts stay open and no letter is
   * sent; the order carries `restockedAt` from here on, which is what puts it in
   * «Позиція недоступна». A later payment re-takes the stock (applyPaymentEvent)
   * and so does an operator moving it on (the revive path of updateStatus).
   *
   * @param deadline the moment the worker judged the reservation overdue at —
   *   the write only lands on an order whose deadline is still at or before it.
   * @returns `false` when the order was paid or released between the worker's
   *   read and this write — nothing to do, not an error.
   */
  async releaseExpiredReservation(orderId: string, deadline: Date): Promise<boolean> {
    const released = await this.orderRepository.releaseReservation(orderId, deadline);

    if (released) {
      this.logger.info(
        { event: 'order.reservation_released', orderId },
        'Unpaid order kept open; its reserved stock was returned to sale',
      );
    }

    return released;
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
      // Filtered by the cross-rule for the same reason the payment list is
      // (review of plan 180): a target the PATCH would refuse has no business
      // being in the list the picker renders.
      allowed: allowedTransitions(existing.status).filter((to) =>
        this.isOrderTargetReachable(existing.paymentStatus, to),
      ),
      updatedAt: existing.updatedAt,
    };
  }

  /**
   * «Fully refunded money» vs a live order, asked of the ORDER (review of plan 180).
   *
   * The payment side refused «full refund on a live order» when
   * the PAYMENT moves. The identical pair was reachable when the ORDER moved
   * instead: CANCELLED + REFUNDED is legal and ordinary, and reviving such an
   * order into PENDING/CONFIRMED/PROCESSING produced exactly the state the other
   * door calls impossible — goods being picked for a customer who has the money.
   *
   * Deliberately asked of `REFUNDED` only, not of every unsettled status.
   * PARTIALLY_REFUNDED must stay revivable: one line refunded out of three is
   * the ordinary case B-1 §1 went out of its way to keep legal.
   *
   * CANCELLED stays reachable (a re-cancel is the state machine's call). The
   * order's REFUNDED is derived from the ledger since R2 A4 (TASK-1969) and is
   * nobody's target here.
   */
  private isOrderTargetReachable(paymentStatus: PaymentStatus, to: OrderStatus): boolean {
    if (paymentStatus !== PaymentStatus.REFUNDED) return true;
    return to === OrderStatus.CANCELLED;
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

    if (plan.refusedPaymentStatusChange) {
      // WARN, not ERROR: nothing is broken and nothing needs retrying — the event
      // simply disagrees with what we hold, and we kept what we hold. It is a
      // warning rather than info because a provider contradicting our records is
      // how a lost callback or a double refund first becomes visible.
      this.logger.warn(
        {
          event: 'order.payment_event_transition_refused',
          orderId: order.id,
          paymentId: payment.id,
          outcome: event.outcome,
          providerStatus: event.providerStatus,
          current: plan.refusedPaymentStatusChange.current,
          rejected: plan.refusedPaymentStatusChange.rejected,
          // Both added by the review of plan 180. `reason` names the rule that
          // refused, and `status` is the column the cross-rule reads — without
          // it a cross-rule refusal reads as `PAID → REFUNDED`, which the table
          // ALLOWS, and the line contradicts itself.
          reason: plan.refusedPaymentStatusChange.reason,
          status: order.status,
        },
        'Payment event asked for an illegal payment-status move; recorded and ignored',
      );
    }

    if (plan.receipt?.note === OrderHistoryNote.PAID_AFTER_CANCEL) {
      // WARN: money arrived for an order the shop no longer holds stock for.
      // Nothing is broken, but a person has to revive or refund it (TASK-619).
      // TASK-678: and it is NOT announced as a new order — see shopPingOnPaid.
      this.logger.warn(
        {
          event: 'order.payment_after_cancel',
          orderId: order.id,
          paymentId: payment.id,
          providerStatus: event.providerStatus,
        },
        'Payment succeeded on a cancelled order; recorded as paid, order left cancelled for the operator',
      );
    }

    await this.orderRepository.applyPaymentOutcome(plan, await this.shopPingOnPaid(order, plan));

    this.logger.info(
      {
        event: 'order.payment_event_applied',
        orderId: order.id,
        paymentId: payment.id,
        outcome: event.outcome,
        providerStatus: event.providerStatus,
        status: plan.statusChange?.to,
      },
      'Payment event applied to order',
    );

    return { applied: true, orderId: order.id };
  }

  /**
   * Write a LiqPay refund the shop is about to request into the order ledger —
   * REQUESTED, counted at once, under the order lock (TASK-1500 / TASK-2047).
   * The payment module calls this BEFORE it asks the provider, and
   * {@link voidProviderRefund} if the provider refuses. Over the ceiling,
   * nothing is written and `exceeds` comes back with what is available.
   */
  requestProviderRefund(input: ProviderRefundRequestInput): Promise<ProviderRefundRequest> {
    return this.orderRepository.requestProviderRefund(input);
  }

  /**
   * Void a REQUESTED refund the provider refused; it stops counting (TASK-1500).
   * `actorId` is the operator whose request was refused — the author of the
   * recompute's history rows (R2 pre-merge review).
   */
  voidProviderRefund(
    orderId: string,
    entryId: string,
    reason: string,
    actorId: string | null,
  ): Promise<void> {
    return this.orderRepository.voidProviderRefund(orderId, entryId, reason, actorId);
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

    // A refund reports more than nothing and no more than the charge. Whether
    // LiqPay's `reversed` amount is the single refund or the running total is
    // not confirmed (TASK-1500), so it decides nothing — the money of a refund
    // is what the shop requested — and is only sanity-checked here. Every other
    // outcome must report the charge exactly.
    const isRefund =
      event.outcome === PaymentOutcome.REFUNDED ||
      event.outcome === PaymentOutcome.PARTIALLY_REFUNDED;
    const amountAgrees = isRefund
      ? Number.isFinite(reportedCents) && reportedCents > 0 && reportedCents <= expectedCents
      : expectedCents === reportedCents;

    if (amountAgrees && currencyMatches) {
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
   * from a transaction body. Since R2 A2 (TASK-1500 / TASK-2047) money is written
   * to the order ledger and the payment status is DERIVED from it
   * (`OrderMoneyRepository.recompute`) — no money outcome hand-builds a status:
   *
   * - **SUCCEEDED** carries a `receipt` (the attempt's amount in kopecks → one
   *   `LIQPAY_PAYMENT` entry), stamps `paidAt`, lifts the reservation deadline,
   *   and moves a still-PENDING order to CONFIRMED. An attempt that already
   *   succeeded → null; a DIFFERENT attempt on a paid order is a second receipt
   *   (an overpayment, never lost). On a CANCELLED order (TASK-619) the money is
   *   recorded but the order stays CANCELLED with no stock moved, and the
   *   history row is flagged `PAID_AFTER_CANCEL` for the operator to revive or
   *   refund. On a LIVE order whose hold ORDER_RESERVATION_EXPIRY=release gave
   *   back (TASK-627) the plan carries `stockHold: 'released'` and the stock is
   *   re-taken in the same write; if it is gone, the money is still recorded and
   *   the order stays in «Позиція недоступна».
   * - **FAILED** records the failed attempt and re-derives the payment status:
   *   FAILED only while nothing is paid AND this was the last attempt — a late
   *   failure callback for a superseded attempt must never un-pay a paid order
   *   nor fail a newer PENDING one. The order itself is NOT cancelled —
   *   the customer may retry, and the reservation worker owns the deadline.
   * - **REFUNDED / PARTIALLY_REFUNDED** carry `providerRefund`: confirm the
   *   oldest refund the shop REQUESTED, or record PROVIDER_REFUND_UNMATCHED when
   *   it requested none (TASK-1500). The provider's amount decides nothing. Stock
   *   is deliberately NOT credited back: the goods have to physically return
   *   first (TASK-124's rule, unchanged).
   * - **IGNORED** — "still processing" — changes nothing. There is no PENDING
   *   outcome for exactly this reason: treating "not finished yet" as an event to
   *   act on is how an order flips to paid before the money exists.
   *
   * ── Why this door never throws (TASK-431) ───────────────────────────────────
   * The callers here are a LiqPay webhook and the reconcile worker; both retry
   * on anything that is not a 2xx, so a 409 would not refuse the event, it would
   * schedule it again every few minutes until someone noticed. A provider
   * statement that disagrees with the label (a success on a refunded order, a
   * refund nobody asked for) is therefore recorded — as money, or as a history
   * note — and never raised.
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
      expected: { status: order.status, paymentStatus: order.paymentStatus },
      ...(event.providerPaymentId ? { providerPaymentId: event.providerPaymentId } : {}),
    };

    switch (event.outcome) {
      case PaymentOutcome.SUCCEEDED: {
        // Idempotency of meaning is per ATTEMPT (R2 A2): its receipt is written
        // once, in the transaction that settles it, so an attempt already
        // SUCCEEDED (or later REFUNDED) has nothing new to say. A DIFFERENT
        // attempt that also succeeded is real money and is recorded — an
        // overpayment the balance shows as «Винні покупцю», never lost.
        if (
          payment.status === PaymentAttemptStatus.SUCCEEDED ||
          payment.status === PaymentAttemptStatus.REFUNDED
        ) {
          return null;
        }
        const settled = {
          ...base,
          attemptStatus: PaymentAttemptStatus.SUCCEEDED,
          settledAt: now,
          failureCode: null,
          failureMessage: null,
          paidAt: order.paidAt ?? now,
          clearReservation: true,
        };
        const receipt = { amountKop: toCents(payment.amount.toString()), occurredAt: now };
        // TASK-619 (owner decision B-11 №3, plan 178): a success on an order that
        // is already CANCELLED — the reservation TTL lapsed while the LiqPay page
        // was still open. CANCELLED → CONFIRMED is a legal move, but only through
        // the revive path, which re-reserves stock and clears `restockedAt`; done
        // here it produced a paid, confirmed order with nothing held for it. So
        // the money is recorded and the order is left exactly as cancelled, with
        // a flagged history row: revive (if stock allows) or refund is the
        // operator's call, never an automatic one.
        if (order.status === OrderStatus.CANCELLED) {
          return {
            ...settled,
            receipt: { ...receipt, note: OrderHistoryNote.PAID_AFTER_CANCEL },
          };
        }
        // Money already arrived once (a second attempt): the stock was settled
        // by the first payment, so there is no hold to pin or re-take.
        const firstMoney = !ALREADY_PAID_STATUSES.includes(order.paymentStatus);
        return {
          ...settled,
          receipt,
          // TASK-627: a live order whose hold ORDER_RESERVATION_EXPIRY=release gave
          // back is re-reserved by this payment; one still held must still be held
          // at write time. See PaymentApplyPlan.stockHold.
          ...(firstMoney ? { stockHold: order.restockedAt != null ? 'released' : 'held' } : {}),
          ...(canTransition(order.status, OrderStatus.CONFIRMED)
            ? { statusChange: { from: order.status, to: OrderStatus.CONFIRMED } }
            : {}),
        } satisfies PaymentApplyPlan;
      }

      case PaymentOutcome.FAILED: {
        // An attempt that failed is worth recording even on a paid order (the
        // customer's second card may have been declined before the third worked),
        // but it must not touch the order's payment status.
        //
        // TASK-431: "must not touch it" is now the state machine's answer rather
        // than a hand-written list of settled statuses — which also closes the
        // case the list missed, a repeat FAILED on an order already marked FAILED
        // appending a second identical history row. A blocked move is NOT
        // recorded as a refusal here: for this outcome a non-move is the designed
        // behaviour (a superseded attempt), not a contradiction worth flagging.
        //
        // R2 review: the payment status itself is DERIVED (recompute: "nothing
        // paid and the LAST attempt failed"), never set here — a late failure of
        // an older attempt must not mark the order FAILED while a newer attempt
        // is still PENDING.
        const canFail = canTransitionPayment(order.paymentStatus, PaymentStatus.FAILED);
        if (payment.status === PaymentAttemptStatus.FAILED && !canFail) return null;
        return {
          ...base,
          attemptStatus: PaymentAttemptStatus.FAILED,
          ...(event.failureCode !== undefined ? { failureCode: event.failureCode } : {}),
          ...(event.failureMessage !== undefined ? { failureMessage: event.failureMessage } : {}),
          rederivePaymentStatus: true,
        };
      }

      case PaymentOutcome.REFUNDED:
      case PaymentOutcome.PARTIALLY_REFUNDED: {
        // TASK-1500 (R2 A2): the money of a LiqPay refund is what the SHOP
        // requested — a REQUESTED `LIQPAY_REFUND` entry, already counted. This
        // event only confirms the oldest such request (or, if there is none,
        // leaves a PROVIDER_REFUND_UNMATCHED note); which of the two happens is
        // decided under the order lock, by the repository. So the plan is the
        // same for a full and a partial `reversed`, and moves no payment status
        // by itself. Stock is deliberately NOT credited back: the goods have to
        // physically return first (TASK-124's rule, unchanged).
        //
        // No order move either (TASK-1969, R2 A4): the order's REFUNDED is
        // derived from returns and payouts by the recompute the confirmation
        // runs — a provider refund alone never ends an order.
        //
        // TASK-2336 mitigation: the reported amount travels with the plan so the
        // repository confirms a request only when the two agree.
        return {
          ...base,
          attemptStatus: payment.status,
          providerRefund: { providerAmountKop: reportedAmountKop(event.amount) },
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
    // A bank transfer (TASK-2047) arrives by hand, like cash on delivery: no card
    // page to abandon, so nothing to auto-cancel.
    if (method === PaymentMethod.ON_DELIVERY || method === PaymentMethod.BANK_TRANSFER) {
      return null;
    }

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

/** What {@link OrderService.resolveDelivery} decided for a checkout (TASK-643). */
interface ResolvedDelivery {
  deliveryMethod: DeliveryMethod;
  /** Set only for PICKUP. */
  pickupPointId?: string;
  shippingCost: number;
  shippingAddress: ShippingAddressData;
}

/** An active pickup point as the delivery service resolves it (TASK-643). */
type ActivePickupPoint = NonNullable<
  Awaited<ReturnType<DeliveryService['resolveActivePickupPoint']>>
>;

/**
 * Compute the cart subtotal as a "XX.YY" decimal string with the one shared
 * line-total rule (`money.util`, TASK-807) — the same one CartEntity uses for
 * the subtotal the discount preview shows. Feeds the authoritative discount
 * recomputation in {@link OrderService.createOrder} and, since TASK-643, the
 * courier's free-delivery threshold.
 */
function computeSubtotalString(items: CartWithItems['items']): string {
  return centsToString(
    sumLineCents(items.map((item) => ({ price: item.product.price, quantity: item.quantity }))),
  );
}
