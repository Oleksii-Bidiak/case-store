import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  OrderHistoryChangeType,
} from '@prisma/client';
import { PrismaService } from '../prisma';
import { normalizeUaPhone, phoneDigits } from '../common/validators';
import {
  CacheService,
  productDetailIdKey,
  productDetailSlugKey,
  PRODUCT_LIST_PREFIX,
} from '../cache';
// The narrow seam SearchModule exports — this file never learns what the search
// engine is, exactly as `ProductService` does not.
import { ProductIndexer } from '../search/product-indexer';
import type {
  CreateOrderParams,
  OrderWithItems,
  OrderItemRow,
  OrderStatusHistoryRow,
  OrderAddonSnapshot,
  PaymentWithOrderRow,
  PaymentApplyPlan,
  ManualOrderParams,
} from './order.types';
import type { OrderListQueryDto, AdminOrderListQueryDto, AddressDto } from './dto';
// The export query is declared beside the list query it narrows, and is not part
// of the module's public DTO barrel — only this repository and the controller
// that hands it over ever name the type.
import type { AdminOrderExportQueryDto } from './dto/admin-order-list-query.dto';
// TASK-425: the "waiting too long" threshold is the DASHBOARD's, imported rather
// than re-typed. A 48 copied into this module is a 72 the day someone changes
// the other one, and the chip would then quietly disagree with the tile.
import { PENDING_STALE_HOURS } from '../dashboard/dashboard.types';
import { staleOrderError } from './order.errors';

/**
 * Shared Prisma include clause for order queries. Always fetches the order
 * lines (ordered by creation) with the minimal product/variant reference data
 * needed to render an order, mirroring the `CART_ITEMS_INCLUDE` pattern. The
 * product select includes `slug` plus the primary `images` entry (isPrimary-first,
 * then sortOrder; `take: 1`) so each order line can render a thumbnail and link
 * to the PDP.
 */
const ORDERS_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      orderId: true,
      productId: true,
      quantity: true,
      price: true,
      createdAt: true,
      // Frozen add-on snapshots (TASK-174) — a pure snapshot read: `name`/`price`
      // live on the row itself, so no live join back to the catalog is needed
      // (and a later reprice can never leak into order history).
      addons: {
        orderBy: { createdAt: 'asc' as const },
        select: { id: true, addonServiceId: true, name: true, price: true },
      },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          images: {
            orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
            take: 1,
            select: { url: true },
          },
        },
      },
    },
  },
} satisfies Prisma.OrderInclude;

/**
 * Admin-only include: the lean order include plus the owning user's account
 * fields (id, email, name). Used exclusively by the admin read paths
 * (`findAll`, `findByIdForAdmin`) so an admin can see who placed each order.
 * Customer-facing and mutation queries keep {@link ORDERS_INCLUDE} (no user
 * join), so customer email never reaches non-admin responses (TASK-125).
 */
const ADMIN_ORDERS_INCLUDE = {
  ...ORDERS_INCLUDE,
  /**
   * The same lines as {@link ORDERS_INCLUDE}, plus the three catalogue columns
   * that decide whether a line is still orderable (TASK-470): `deletedAt`,
   * `isActive`, `stock`.
   *
   * Spread from the shared include rather than restated, so a column added to an
   * order line is carried here by construction. Admin-only on purpose: "this
   * position is no longer available" is a message for the operator who has to
   * ring the customer and offer a choice, and the owner's decision (B-1 §3) is
   * explicitly that NOTHING is sent to the buyer automatically. A customer-facing
   * read therefore never joins these, and the entity reports nothing rather than
   * reporting "all fine".
   */
  items: {
    ...ORDERS_INCLUDE.items,
    select: {
      ...ORDERS_INCLUDE.items.select,
      product: {
        select: {
          ...ORDERS_INCLUDE.items.select.product.select,
          deletedAt: true,
          isActive: true,
          stock: true,
        },
      },
    },
  },
  user: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
  /**
   * Just the refunded amounts (TASK-472) — never the return rows themselves.
   *
   * The "Повернуто X з Y" label needs one number per order, Σ `refundedAmount`,
   * and it is computed ON READ rather than stored: a column holding the same sum
   * would have to be maintained by every path that touches a return, and the
   * first one that forgets leaves the order claiming an amount that no return
   * supports (owner decision B-1, closing paragraph: all five labels are
   * derived).
   *
   * Admin include only. The label belongs to the admin list and order card; the
   * storefront reads returns through the returns endpoints, so a customer-facing
   * order read should not pay for this join.
   */
  returns: { select: { refundedAmount: true } },
} satisfies Prisma.OrderInclude;

/**
 * Orders holding at least one line that can no longer be supplied (TASK-470).
 *
 * The WHERE behind the `hasUnavailableItems` list filter, and the exact
 * predicate `DashboardRepository`'s «Недоступні позиції» tile counts — written
 * independently there rather than imported, for the same reason
 * `unpaidInTransit` is: the dashboard must not depend on the order module. The
 * two are kept in step by both restating the owner's four conditions (B-1 §3),
 * which is also what `OrderEntity.findUnavailableItemIds` evaluates per line.
 *
 * CANCELLED and REFUNDED orders are excluded here exactly as they are in the
 * entity: their stock came back because they ENDED, and counting them would bury
 * the handful of orders an operator must actually ring about under every
 * cancelled order the shop ever had.
 */
function unavailableItemsWhere(): Prisma.OrderWhereInput {
  return {
    status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
    OR: [
      {
        items: {
          some: {
            product: {
              OR: [{ deletedAt: { not: null } }, { isActive: false }, { stock: { lt: 0 } }],
            },
          },
        },
      },
      // The fourth condition: the TTL worker released this order's hold while the
      // order itself is still expected to be fulfilled.
      { restockedAt: { not: null } },
    ],
  };
}

/**
 * Column set for the admin CSV export (TASK-425).
 *
 * A `select`, emphatically not {@link ADMIN_ORDERS_INCLUDE}: the export reads
 * thousands of orders at once, and the admin include drags every line, every
 * add-on snapshot, every product row and a product image with each order. The
 * CSV needs none of that — one row per ORDER — so the only thing taken from the
 * lines is `_count`, which Postgres answers without materialising them.
 */
const ORDER_EXPORT_SELECT = {
  id: true,
  createdAt: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  paidAt: true,
  subtotal: true,
  discount: true,
  discountCode: true,
  addonsTotal: true,
  shippingCost: true,
  tax: true,
  total: true,
  trackingNumber: true,
  guestEmail: true,
  guestPhone: true,
  guestName: true,
  shippingAddress: true,
  user: { select: { email: true, firstName: true, lastName: true, phone: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

/**
 * One order as the CSV export reads it (TASK-425) — the shape of
 * {@link ORDER_EXPORT_SELECT}. Declared here rather than in `order.types.ts`
 * because it describes this query and nothing else, the same way
 * `CartWithItems` belongs to the cart repository.
 */
export interface AdminOrderExportRow {
  id: string;
  createdAt: Date;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  paidAt: Date | null;
  subtotal: { toString(): string };
  discount: { toString(): string };
  discountCode: string | null;
  addonsTotal: { toString(): string } | null;
  shippingCost: { toString(): string };
  tax: { toString(): string };
  total: { toString(): string };
  trackingNumber: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  guestName: string | null;
  shippingAddress: Prisma.JsonValue | null;
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  } | null;
  _count: { items: number };
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

/**
 * How many digits a free-text search term must contain before it is treated as
 * a (partial) phone number at all (TASK-466).
 *
 * The guard is not a nicety: `normalizeUaPhone('ivan')` returns `''`, and
 * `{ contains: '' }` matches EVERY row — so normalising the term unconditionally
 * would turn a search for a customer's name into "show me all orders". Three is
 * low enough that an operator can narrow by an operator code (`067`) and high
 * enough that a one- or two-digit stray inside a name search does nothing.
 */
const SEARCH_PHONE_MIN_DIGITS = 3;

/**
 * The payment methods whose stock reservation runs on a clock (review of plan
 * 180).
 *
 * Kept as one list so the two mark filters below, `resolveReservationDeadline`
 * (which gives a deadline to everything but ON_DELIVERY) and
 * `PaymentRepository.findExpiredReservations` (which cancels on this exact set)
 * cannot drift. They did: the filters were written as `= ONLINE` while the
 * worker already cancelled INSTALLMENTS too, so a BNPL order was auto-cancelled
 * without ever having shown «Очікує оплати» or «Резерв сплив» to anyone.
 */
// Mutable on purpose: Prisma's generated `in` filter takes `PaymentMethod[]`
// and refuses a `readonly` array. Copied at each use site below.
const TIMED_RESERVATION_METHODS: PaymentMethod[] = [
  PaymentMethod.ONLINE,
  PaymentMethod.INSTALLMENTS,
];

@Injectable()
export class OrderRepository {
  private readonly logger = new Logger(OrderRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly productIndexer: ProductIndexer,
  ) {}

  /**
   * Create an order from a cart inside a single transaction:
   *   1. Snapshot each cart line's unit price and compute the subtotal.
   *   2. Create the order with its nested items.
   *   3. Clear the originating cart.
   *   4. Atomically decrement stock for each variant line, guarding against
   *      overselling under concurrency (see below).
   * Either the whole block commits or nothing does — there is no partial state.
   *
   * @throws ConflictException when a variant has insufficient stock at commit
   *   time. The service performs an early best-effort check, but that read is
   *   a TOCTOU window: two concurrent orders for the last unit could both pass
   *   it. The authoritative guard is the conditional `updateMany` below
   *   (`WHERE stock >= quantity`) — if it affects zero rows the stock is gone,
   *   so we throw and the whole transaction rolls back. This is what keeps
   *   stock from ever going negative.
   */
  async createFromCart(
    params: CreateOrderParams,
    // TASK-103-F: optional in-transaction hook. Invoked with the order's `tx`
    // client and the freshly-created order so callers can perform writes that
    // must commit (or roll back) atomically with the order — e.g. enqueue the
    // confirmation email into the mail outbox. Kept generic so other in-tx
    // side-effects (e.g. coupon redemption) can reuse the same seam.
    afterCreate?: (tx: Prisma.TransactionClient, created: OrderWithItems) => Promise<void>,
  ): Promise<OrderWithItems> {
    const { userId, cartId, cartItems, shippingAddress, billingAddress, notes, shippingCost } =
      params;
    // TASK-079: optional promo-code discount, already recomputed by the service.
    const discountParam = params.discount;

    // Snapshot each line's unit price (the position's price) into the order-item
    // rows, along with the add-ons selected on that line (TASK-174 — name +
    // EFFECTIVE price, both frozen here for the same reason the unit price is).
    // These persisted rows — not the cart — are the order's source of truth from
    // here on.
    const addonsByCartItemId: Map<string, OrderAddonSnapshot[]> =
      params.addonsByCartItemId ?? new Map();
    const itemData = cartItems.map((item) => {
      const addons = addonsByCartItemId.get(item.id) ?? [];
      return {
        productId: item.productId,
        quantity: item.quantity,
        price: new Prisma.Decimal(item.product.price.toString()),
        ...(addons.length > 0
          ? {
              addons: {
                create: addons.map((addon) => ({
                  addonServiceId: addon.addonServiceId,
                  name: addon.name,
                  price: new Prisma.Decimal(addon.price),
                })),
              },
            }
          : {}),
      };
    });

    // Derive the subtotal from the persisted order-item rows themselves (single
    // source of truth) using integer-cents arithmetic to avoid float drift.
    const subtotalCents = itemData.reduce(
      (cents, item) => cents + Math.round(item.price.toNumber() * 100) * item.quantity,
      0,
    );
    const subtotal = new Prisma.Decimal(centsToDecimalString(subtotalCents));

    // Shipping cost comes from the Nova Poshta estimate (TASK-080); 0 for
    // free-text/manual orders.
    const shipping = new Prisma.Decimal((shippingCost ?? 0).toString());

    // ─── TASK-174 add-on block ─────────────────────────────────────────────────
    // Derive addonsTotal from the rows about to be persisted (same
    // single-source-of-truth + integer-cents discipline as the subtotal above).
    // Flat: an add-on is charged once per line, never multiplied by quantity.
    const addonsCents = [...addonsByCartItemId.values()]
      .flat()
      .reduce((cents, addon) => cents + Math.round(parseFloat(addon.price) * 100), 0);
    const addonsTotal = new Prisma.Decimal(centsToDecimalString(addonsCents));
    // ───────────────────────────────────────────────────────────────────────────

    // ─── TASK-079 discount block ───────────────────────────────────────────────
    // The service already recomputed the amount authoritatively (never trusting
    // a client value) and clamped it to the PRODUCT subtotal. Persist it on the
    // order and subtract from the total.
    //
    // HARD INVARIANT (plan 150, owner decision 4):
    //   total = subtotal + shipping + addonsTotal - discount
    // with `discount` computed and clamped against `subtotal` ALONE. `addonsTotal`
    // joins `shippingCost` on the "excluded from the discount base" side of the
    // ledger: a coupon can never reduce what an add-on service contributes to the
    // payable total. This is not configurable — discounts ON add-on services are
    // parked separately (TASK-286).
    const discountAmount = discountParam
      ? new Prisma.Decimal(discountParam.amount)
      : new Prisma.Decimal(0);
    const total = subtotal.plus(shipping).plus(addonsTotal).minus(discountAmount);
    // ───────────────────────────────────────────────────────────────────────────

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId,
          // TASK-338: exactly one of `userId` and this block is populated. The
          // contact details are a snapshot of what was typed at checkout and are
          // never rewritten, not even when an account later claims the order.
          ...(params.guest
            ? {
                guestEmail: params.guest.email,
                guestPhone: params.guest.phone,
                guestName: params.guest.name,
                accessTokenHash: params.guest.accessTokenHash,
              }
            : {}),
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          subtotal,
          discount: discountAmount,
          discountCode: discountParam?.code ?? null,
          shippingCost: shipping,
          tax: new Prisma.Decimal(0),
          addonsTotal,
          total,
          shippingAddress: shippingAddress as unknown as Prisma.InputJsonValue,
          billingAddress: (billingAddress ?? shippingAddress) as unknown as Prisma.InputJsonValue,
          notes: notes ?? null,
          items: { create: itemData },
        },
        include: ORDERS_INCLUDE,
      });

      // TASK-251: the order's birth record — an initial null→PENDING history row
      // written in the same transaction so the timeline always starts at
      // creation. System-authored (changedBy null): the customer places the
      // order, no admin "changes" its status.
      await tx.orderStatusHistory.create({
        data: {
          orderId: created.id,
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedBy: null,
        },
      });

      // TASK-079: redeem the promo code inside this same transaction — the
      // service re-checks the caps against the live row, bumps redeemedCount,
      // and inserts the (orderId-unique) redemption. A cap race or a mid-flight
      // deactivation throws here and rolls back the entire order.
      if (discountParam) {
        await discountParam.redeem(created.id, tx);
      }

      // Empty the originating cart so it cannot be ordered twice.
      await tx.cartItem.deleteMany({ where: { cartId } });

      // Authoritative inventory decrement on each ordered position. The
      // conditional `WHERE stock >= quantity` makes this safe under concurrency:
      // if a racing order already consumed the stock, `count` is 0 and we throw,
      // rolling back the whole transaction (no order, no cart clear, no partial
      // decrement). Stock can therefore never go negative.
      for (const item of cartItems) {
        const { count } = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (count === 0) {
          throw new ConflictException(
            `Insufficient stock for "${item.product.name}" — please review your cart`,
          );
        }
      }

      // TASK-103-F: run any in-transaction side-effect (e.g. enqueue the
      // order-confirmation outbox row) so it commits atomically with the order.
      // Throwing here rolls back the whole order — exactly the outbox guarantee.
      if (afterCreate) {
        await afterCreate(tx, created as unknown as OrderWithItems);
      }

      return created;
    });

    // Stock for the ordered positions just changed — evict their detail caches
    // and all list pages. Eviction errors are swallowed inside CacheService, so
    // they never affect the order.
    await this.evictProductCaches((order as OrderWithItems).items);

    return order as OrderWithItems;
  }

  /**
   * Read the catalogue facts needed to price and stock-check an operator-created
   * order (TASK-341).
   *
   * Lives here rather than reaching into ProductRepository so the order module
   * keeps one door to the database, and so this read carries exactly the four
   * facts the decision needs — price, stock, and the two "is it on sale" flags —
   * instead of a full product with its images and rollups.
   */
  findOrderableProducts(productIds: string[]): Promise<
    Array<{
      id: string;
      name: string;
      price: { toString(): string };
      stock: number;
      isActive: boolean;
      category: { isActive: boolean };
    }>
  > {
    return this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        isActive: true,
        category: { select: { isActive: true } },
      },
    });
  }

  /**
   * Create an order the OPERATOR placed on the customer's behalf — a phone order
   * (TASK-341).
   *
   * Deliberately NOT a variant of {@link createFromCart}. That method's whole
   * shape is "convert this cart": it empties the cart, redeems the promo code the
   * shopper typed, and freezes the add-ons they picked. A phone order has no cart
   * and none of those steps, and threading a `cartId?: null` through the existing
   * transaction would leave every one of those concerns guarded by an `if` that a
   * later edit could get wrong.
   *
   * What IS shared is the part that must never diverge: the conditional
   * `WHERE stock >= quantity` decrement, so an operator cannot oversell any more
   * than a shopper can.
   *
   * @throws ConflictException when a line's stock is gone at commit time.
   */
  async createManual(params: ManualOrderParams, changedBy: string | null): Promise<OrderWithItems> {
    const itemData = params.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: new Prisma.Decimal(item.price),
    }));

    const subtotalCents = itemData.reduce(
      (cents, item) => cents + Math.round(item.price.toNumber() * 100) * item.quantity,
      0,
    );
    const subtotal = new Prisma.Decimal(centsToDecimalString(subtotalCents));
    const shipping = new Prisma.Decimal((params.shippingCost ?? 0).toString());
    const total = subtotal.plus(shipping);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId: params.userId ?? null,
          ...(params.guest
            ? {
                guestEmail: params.guest.email,
                guestPhone: params.guest.phone,
                guestName: params.guest.name,
              }
            : {}),
          // TASK-484: the buyer's key to their own order, on a phone order too.
          // `accessTokenIssuedAt` is written in the same breath and is not
          // decoration: the link's TTL is counted from it, so an order whose
          // token is re-issued months later hands out a link that is alive, not
          // one that was dead before it was pasted into a chat (B-5 §4).
          ...(params.accessTokenHash
            ? {
                accessTokenHash: params.accessTokenHash,
                accessTokenIssuedAt: new Date(),
              }
            : {}),
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
          // The countdown after which an unpaid card order is auto-cancelled and
          // its stock returned. Only ONLINE/INSTALLMENTS carry one — cash on
          // delivery holds its reservation until an operator intervenes — so the
          // service passes null for those and this column stays null, which is
          // exactly what `findExpiredReservations` filters on.
          ...(params.reservationExpiresAt !== undefined
            ? { reservationExpiresAt: params.reservationExpiresAt }
            : {}),
          subtotal,
          discount: new Prisma.Decimal(0),
          shippingCost: shipping,
          tax: new Prisma.Decimal(0),
          addonsTotal: new Prisma.Decimal(0),
          total,
          shippingAddress: params.shippingAddress as unknown as Prisma.InputJsonValue,
          billingAddress: (params.billingAddress ??
            params.shippingAddress) as unknown as Prisma.InputJsonValue,
          notes: params.notes ?? null,
          internalNotes: params.internalNotes ?? null,
          items: { create: itemData },
        },
        include: ORDERS_INCLUDE,
      });

      // The order's birth record. Unlike a self-service order this one HAS an
      // acting user — the operator who took the call — and recording them is the
      // whole point of an audit trail on manually-created orders.
      await tx.orderStatusHistory.create({
        data: {
          orderId: created.id,
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedBy,
        },
      });

      for (const item of params.items) {
        const { count } = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (count === 0) {
          throw new ConflictException(
            `Insufficient stock for "${item.name}" — please review the order`,
          );
        }
      }

      return created;
    });

    await this.evictProductCaches((order as OrderWithItems).items);

    return order as OrderWithItems;
  }

  /**
   * Replace an order's delivery address before it ships (TASK-341).
   *
   * Address-only: changing WHERE a parcel goes touches no money and no stock, so
   * it is separable from the line-item edit that does. The caller enforces the
   * pre-shipment rule; the repository writes the snapshot.
   */
  async updateShippingAddress(
    orderId: string,
    shippingAddress: AddressDto,
    options: { expectedUpdatedAt?: Date } = {},
  ): Promise<OrderWithItems> {
    const data = { shippingAddress: shippingAddress as unknown as Prisma.InputJsonValue };

    if (options.expectedUpdatedAt) {
      const { count } = await this.prisma.order.updateMany({
        where: { id: orderId, updatedAt: options.expectedUpdatedAt },
        data,
      });
      if (count === 0) {
        throw staleOrderError();
      }
    } else {
      await this.prisma.order.update({ where: { id: orderId }, data });
    }

    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ADMIN_ORDERS_INCLUDE,
    }) as Promise<OrderWithItems>;
  }

  /**
   * Find all orders for a user, newest first, with an optional status filter
   * and pagination. Runs the count and page query in a single transaction.
   */
  async findByUserId(
    userId: string,
    query: OrderListQueryDto,
  ): Promise<{ orders: OrderWithItems[]; total: number }> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where: Prisma.OrderWhereInput = {
      userId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDERS_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { orders: orders as OrderWithItems[], total };
  }

  /**
   * Admin — find orders across ALL users, newest first, with optional
   * `userId`, `status`, and created-at date-range filters plus pagination.
   * Runs the count and page query in a single transaction. Unlike
   * {@link findByUserId} this is not user-scoped.
   */
  async findAll(
    query: AdminOrderListQueryDto,
  ): Promise<{ orders: OrderWithItems[]; total: number }> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where = this.buildAdminWhere(query);

    // Allow-listed sort (TASK-147). The DTO `@IsIn` already rejects unknown
    // fields at the API boundary; this fallback is a defensive default. NOTE:
    // `status` sorts by the enum's alphabetical order in Postgres, not by
    // business lifecycle order — acceptable for the admin table MVP.
    const ALLOWED_SORT: Record<string, string> = {
      createdAt: 'createdAt',
      total: 'total',
      status: 'status',
    };
    const sortField = ALLOWED_SORT[query.sortBy ?? 'createdAt'] ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ADMIN_ORDERS_INCLUDE,
        orderBy: { [sortField]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { orders: orders as OrderWithItems[], total };
  }

  /**
   * The WHERE clause shared by the admin order list and its CSV export
   * (TASK-425).
   *
   * Extracted rather than copied, because the export's entire promise is "the
   * rows you are looking at". A second copy that drifted by one condition would
   * hand the operator a spreadsheet that silently disagrees with the screen it
   * came from — and a CSV gives no hint that it is the one lying.
   */
  private buildAdminWhere(query: AdminOrderListQueryDto): Prisma.OrderWhereInput {
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.dateFrom) createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) createdAt.lte = new Date(query.dateTo);

    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.dateFrom || query.dateTo ? { createdAt } : {}),
    };

    // TASK-336: free-text search. An operator taking a phone call has an order
    // number, an email or a phone — never a UUID — and since TASK-338 the
    // customer's details may live on the ORDER (guest) rather than on a user row,
    // so both places have to be searched or half the orders become unfindable.
    //
    // The id arm is `startsWith` on a LOWERCASED term because the storefront and
    // every email show the order number as the first 8 characters of the uuid,
    // uppercased — the operator reads back "ABC12345" and the column holds
    // "abc12345…". Emails and phones use case-insensitive `contains`: a customer
    // reads their number aloud as "067 111 22 33" or "+380671112233", and a
    // prefix match would find neither.
    //
    // TASK-466: the two phone arms match the NORMALISED term. Since TASK-466 the
    // columns only ever hold `380XXXXXXXXX`, so `contains` on the raw term found
    // nothing at all whenever the operator typed the number the way the customer
    // dictates it — `050 111 2233` or `+380 50 111 2233`. Normalising the term
    // the same way the DTOs normalise the value puts both sides in one alphabet:
    // a full number matches exactly, a leading fragment (`0501` → `380501`)
    // matches as a prefix, and a trailing fragment (`1112233`, which normalises
    // to itself) still matches mid-string.
    if (query.search) {
      const term = query.search;
      const or: Prisma.OrderWhereInput[] = [
        { id: { startsWith: term.toLowerCase() } },
        { guestEmail: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
      ];

      // Only when the term actually carries digits — see SEARCH_PHONE_MIN_DIGITS
      // for why an unguarded `contains` here would return the whole table.
      if (phoneDigits(term).length >= SEARCH_PHONE_MIN_DIGITS) {
        const phoneTerm = normalizeUaPhone(term);
        or.push({ guestPhone: { contains: phoneTerm } });
        or.push({ user: { phone: { contains: phoneTerm } } });
      }

      where.OR = or;
    }

    // TASK-248: active-but-unpaid ("in-transit") deep-link filter — the same
    // compound condition as DashboardRepository's unrealized-revenue figure, so
    // the tile's count and the rows behind the click are the same set. Additive:
    // composes with the userId/date-range conditions above; only applied when the
    // flag is explicitly true.
    //
    // `PARTIALLY_REFUNDED` sits with `PAID` rather than on the unpaid side
    // (review of plan 180) — it is only reachable FROM `PAID`, so the money did
    // arrive and the shop is owed nothing. See the twin's docblock in
    // `DashboardRepository.unrealizedOrderWhere` for why this differs from the
    // «Борг» mark below, which deliberately casts a wider net.
    if (query.unpaidInTransit) {
      where.paymentStatus = {
        notIn: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
      };
      where.status = { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] };
    }

    // TASK-425: the filters an operator actually reaches for — payment status,
    // payment method, and "has this been sitting too long".
    //
    // They go into `AND` rather than onto `where` directly because the
    // `unpaidInTransit` preset above OWNS `where.paymentStatus` and
    // `where.status`: assigning here would let one filter silently swallow the
    // other, and a filter that is visibly on screen but absent from the query is
    // the worst of the possible outcomes. Prisma ANDs a top-level `AND` with the
    // top-level fields and with `OR`, so this composes with the search too.
    const and: Prisma.OrderWhereInput[] = [];
    if (query.paymentStatus) and.push({ paymentStatus: query.paymentStatus });
    if (query.paymentMethod) and.push({ paymentMethod: query.paymentMethod });
    if (query.pendingOverdue) {
      // Same condition as DashboardRepository.pendingOver48hWhere() — PENDING,
      // not soft-deleted (already on `where`), created before the cut-off — so
      // the chip's rows are exactly the tile's count.
      and.push({
        status: OrderStatus.PENDING,
        createdAt: { lt: new Date(Date.now() - PENDING_STALE_HOURS * 60 * 60 * 1000) },
      });
    }
    // TASK-470 / 471: the derived-mark filters. Same `AND` array and the same
    // reason as TASK-425's — `unpaidInTransit` above owns `where.status` and
    // `where.paymentStatus` outright, and a filter the operator can see on screen
    // but that never reached the query is the worst possible outcome.
    //
    // Each condition is written here EXACTLY as the B-1 catalogue states it, and
    // `orderDerivedLabels()` in the admin panel states it again for the row it
    // renders. The two are kept identical by the marks being derived on both
    // sides from the same columns, never stored: there is no third copy that can
    // go stale between them.
    if (query.hasDebt) {
      and.push({
        status: OrderStatus.DELIVERED,
        paymentStatus: { notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED] },
      });
    }
    // `gt` / `lte` against a single `now` taken here, so the two flags partition
    // the same set at the same instant rather than at two instants a query apart.
    // Rows with a NULL deadline match neither comparison — correct: an order with
    // no timed reservation is in neither state.
    const now = new Date();
    // The method test is a SET, not `= ONLINE` (review of plan 180): BNPL orders
    // carry a deadline as well (`resolveReservationDeadline` excludes only
    // ON_DELIVERY) and `findExpiredReservations` cancels them on
    // `IN (ONLINE, INSTALLMENTS)`. An ONLINE-only filter hid exactly the orders
    // the worker was about to cancel.
    if (query.awaitingPayment) {
      and.push({
        paymentMethod: { in: [...TIMED_RESERVATION_METHODS] },
        paymentStatus: PaymentStatus.PENDING,
        reservationExpiresAt: { gt: now },
      });
    }
    if (query.reservationExpired) {
      and.push({
        paymentMethod: { in: [...TIMED_RESERVATION_METHODS] },
        paymentStatus: PaymentStatus.PENDING,
        reservationExpiresAt: { lte: now },
      });
    }
    if (query.hasUnavailableItems) and.push(unavailableItemsWhere());

    if (and.length > 0) where.AND = and;

    return where;
  }

  /**
   * Admin — every order matching the CURRENT filters, newest first, for the CSV
   * export (TASK-425). Capped at `take` rows by the caller.
   *
   * Unpaginated but never unbounded: the caller passes the cap. "Export
   * everything" over a shop's whole order history is one query holding the
   * entire table in memory while a string is built from it, so the cap is the
   * feature, not a limitation of it.
   */
  findAllForExport(query: AdminOrderExportQueryDto, take: number): Promise<AdminOrderExportRow[]> {
    return this.prisma.order.findMany({
      where: this.buildAdminWhere(query),
      // Always newest-first: an export has no column headers to sort by yet, and
      // the newest orders are the ones an operator opens a spreadsheet for.
      orderBy: { createdAt: 'desc' },
      take,
      select: ORDER_EXPORT_SELECT,
    }) as Promise<AdminOrderExportRow[]>;
  }

  /**
   * Admin — find a single order by ID with the owning user joined (account
   * email + name), or null if it does not exist. Mirrors {@link findById} but
   * uses {@link ADMIN_ORDERS_INCLUDE}; called from `OrderService.adminGetOrder`
   * so admin detail responses carry customer data (TASK-125).
   */
  findByIdForAdmin(orderId: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: ADMIN_ORDERS_INCLUDE,
    }) as Promise<OrderWithItems | null>;
  }

  /**
   * Find a single order by ID, or null if it does not exist. Excludes
   * soft-deleted orders (`deletedAt IS NOT NULL`). Because every mutating path
   * (`updateStatus`, `cancelAndRestock`) is gated behind a service
   * call to this method, soft-deleted orders are uniformly unreachable.
   */
  findById(orderId: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: ORDERS_INCLUDE,
    }) as Promise<OrderWithItems | null>;
  }

  /**
   * Update an order's status and payment status in a single atomic write.
   * Ownership, transition validity, and the status→paymentStatus coupling are
   * computed by the service (TASK-123) before this is called; the repository
   * only persists the two columns the service hands it.
   *
   * When `evictProductStockCaches` is set the affected products' detail caches
   * are evicted afterwards (TASK-254): a plain status transition that crosses
   * the pre-shipment boundary (e.g. PROCESSING→SHIPPED, or CANCELLED→PROCESSING)
   * changes each line-item product's DERIVED reserved/physical figures without
   * touching `stock`, so the cached `ProductEntity` on `GET /products/admin/:id`
   * would otherwise serve stale reserved/physical for up to the TTL. The service
   * owns the boundary-crossing decision (it knows PRE_SHIPMENT_STATUSES); the
   * repository just reuses the same {@link evictProductCaches} helper the
   * restock/revive paths use.
   *
   * TASK-332: when `expectedUpdatedAt` is supplied the write becomes CONDITIONAL
   * on the row still carrying that version — `updateMany ... WHERE updatedAt = ?`
   * rather than a bare `update`. The service already compared versions before
   * calling, but that read sits outside this transaction: two admins who click at
   * the same moment both pass it. Making the version part of the WHERE moves the
   * arbitration into the row lock, exactly as `cancelAndRestock` does with
   * `restockedAt IS NULL`. The loser affects zero rows, throws, and appends no
   * history — which is the point, since the history row is the evidence that a
   * change happened.
   */
  async updateStatus(
    orderId: string,
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    paymentStatus: PaymentStatus,
    changedBy: string | null,
    options: { evictProductStockCaches?: boolean; expectedUpdatedAt?: Date } = {},
  ): Promise<OrderWithItems> {
    // TASK-251: converted from a bare update to a $transaction so the status
    // change and its audit-log row commit (or roll back) together. `fromStatus`
    // is supplied by the service (which already loaded it to decide this is a
    // plain transition), not re-read here — see plan 134 Design Decision 4.
    const expectedUpdatedAt = options.expectedUpdatedAt;
    const updated = (await this.prisma.$transaction(async (tx) => {
      if (expectedUpdatedAt) {
        const { count } = await tx.order.updateMany({
          where: { id: orderId, updatedAt: expectedUpdatedAt },
          data: { status: toStatus, paymentStatus },
        });
        if (count === 0) {
          throw staleOrderError();
        }
      } else {
        await tx.order.update({
          where: { id: orderId },
          data: { status: toStatus, paymentStatus },
        });
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus,
          toStatus,
          changedBy,
        },
      });
      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: ORDERS_INCLUDE,
      });
    })) as OrderWithItems;

    if (options.evictProductStockCaches) {
      await this.evictProductCaches(updated.items);
    }

    return updated;
  }

  /**
   * Cancel an order and return the reserved stock to inventory in a single
   * transaction. Stock is decremented when an order is created (PENDING), so a
   * cancellation must give it back, otherwise abandoned/cancelled orders would
   * permanently erode availability. Cancellation is only permitted from PENDING
   * (enforced by the service), and PENDING orders always hold a decrement, so
   * the increment here is exactly symmetric to {@link createFromCart}.
   *
   * Until Stripe (TASK-034) lands this is the manual counterpart to the admin
   * payment-status action: marking paid keeps the stock, cancel releases it.
   *
   * CONCURRENCY (TASK-315). The cancellation is decided by the conditional
   * `updateMany` BELOW, not by the caller's earlier status read. Both callers
   * (`OrderService.cancelOrder` and the admin `updateStatus` auto-restock branch)
   * read the order first and check it is cancellable — but that read is outside
   * this transaction, so two concurrent cancels of the same order (a double
   * click, a client retry on a flaky connection, two open tabs) would both pass
   * that check, both reach here, and both credit the stock back. One decrement,
   * two increments: phantom inventory, which is then oversold to a customer who
   * will never receive it.
   *
   * `restockedAt IS NULL` is the invariant "this order's reservation has not been
   * given back yet" (createFromCart never sets it; reviveAndReserve clears it), so
   * making the stamp itself the guard is exactly the check we need. Under READ
   * COMMITTED the second transaction blocks on the winner's row lock, re-evaluates
   * the WHERE after it commits, matches zero rows, and aborts before touching any
   * product. The loser never increments anything.
   *
   * @throws ConflictException when the stock was already returned, or (TASK-332)
   *   when `expectedUpdatedAt` no longer matches the stored row.
   */
  async cancelAndRestock(
    orderId: string,
    changedBy: string | null,
    options: { expectedUpdatedAt?: Date } = {},
  ): Promise<OrderWithItems> {
    const expectedUpdatedAt = options.expectedUpdatedAt;
    const updated = (await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: ORDERS_INCLUDE,
      });

      // The arbiter. Runs BEFORE any stock write, so a losing concurrent cancel
      // cannot credit inventory on its way out. TASK-228: restockedAt also tells a
      // later revive that this order's stock was given back and must be re-reserved.
      // TASK-332: the caller's version joins the condition, so a lost update loses
      // here too rather than silently winning.
      const { count } = await tx.order.updateMany({
        where: {
          id: orderId,
          restockedAt: null,
          ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}),
        },
        data: { status: OrderStatus.CANCELLED, restockedAt: new Date() },
      });

      if (count === 0) {
        // Two different failures share one zero-row outcome, and the operator
        // needs to be told which: "someone already cancelled this" and "someone
        // edited this while you were deciding" call for different next moves. The
        // freshly-read row above is inside this transaction, so it is authoritative.
        if (expectedUpdatedAt && order.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
          throw staleOrderError();
        }
        throw new ConflictException('This order’s stock has already been returned to inventory');
      }

      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      // TASK-251: audit row — the pre-cancel status (read via the existing
      // findUniqueOrThrow above) is the fromStatus, so no extra read is needed.
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus: order.status,
          toStatus: OrderStatus.CANCELLED,
          changedBy,
        },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: ORDERS_INCLUDE,
      });
    })) as OrderWithItems;

    // Restock changed position stock — evict the same caches as createFromCart.
    await this.evictProductCaches(updated.items);

    return updated;
  }

  /**
   * Revive a restocked (auto-cancelled) order into a live status, re-reserving
   * its stock in the same transaction (TASK-228). The inverse of
   * {@link cancelAndRestock}: each line decrements product stock with the same
   * conditional `WHERE stock >= quantity` guard as {@link createFromCart}, so a
   * revive can never oversell — if the stock was sold in the meantime the whole
   * transaction rolls back and the order stays CANCELLED/REFUNDED.
   *
   * @throws ConflictException when any line no longer has enough stock.
   */
  async reviveAndReserve(
    orderId: string,
    status: OrderStatus,
    paymentStatus: PaymentStatus,
    changedBy: string | null,
    options: { expectedUpdatedAt?: Date } = {},
  ): Promise<OrderWithItems> {
    const expectedUpdatedAt = options.expectedUpdatedAt;
    const updated = (await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: ORDERS_INCLUDE,
      });

      // TASK-332: refuse a lost update BEFORE any stock is decremented — a revive
      // that loses the race must not leave the warehouse short.
      if (expectedUpdatedAt && order.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw staleOrderError();
      }

      for (const item of order.items) {
        const { count } = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (count === 0) {
          throw new ConflictException(
            `Insufficient stock for "${item.product.name}" — cannot revive the order`,
          );
        }
      }

      // TASK-251: audit row — the pre-revive status (e.g. CANCELLED, from the
      // findUniqueOrThrow above) is the fromStatus; the revived status is the to.
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus: order.status,
          toStatus: status,
          changedBy,
        },
      });

      return tx.order.update({
        where: { id: orderId },
        data: { status, paymentStatus, restockedAt: null },
        include: ORDERS_INCLUDE,
      });
    })) as OrderWithItems;

    // Reservation changed position stock — evict the same caches as createFromCart.
    await this.evictProductCaches(updated.items);

    return updated;
  }

  /**
   * Update an order's payment status. Called by the admin payment action and,
   * in future, the payment webhook handler (TASK-034).
   *
   * TASK-251: converted from a bare update to a $transaction so the change and
   * its audit-log row commit atomically. A lightweight `select: { paymentStatus }`
   * read inside the tx captures the fromPaymentStatus for the history row.
   *
   * ── `expectedFrom`: the compare-and-set the table needs (review of plan 180) ─
   * The service validates the move against a status it read in an EARLIER query,
   * so between the read and this write another operator can land a different
   * legal move. Both pass validation, the second overwrites the first, and the
   * pair that actually occurred is one `PAYMENT_TRANSITIONS` forbids — two legal
   * moves composing into an illegal one. It also leaves a timeline describing a
   * sequence that never happened, since both history rows record the same `from`.
   *
   * So the write is conditional on the status the caller validated against, in
   * the same spirit as `updateDetails`'s `expectedUpdatedAt` guard — but keyed on
   * `paymentStatus` rather than `updatedAt`, because that is the column the rule
   * is about: an unrelated edit to the order must not make a legal payment move
   * fail. `count === 0` means the premise is gone, and the caller turns that into
   * the same 409 it would have raised had it read the newer value.
   *
   * Optional so a caller that has not validated against a specific `from` (none
   * today; the webhook has its own planning path) is not forced to invent one.
   *
   * @returns null when the row no longer matches `expectedFrom` — nothing written.
   */
  async updatePaymentStatus(
    orderId: string,
    paymentStatus: PaymentStatus,
    changedBy: string | null,
    options: { expectedFrom?: PaymentStatus } = {},
  ): Promise<OrderWithItems | null> {
    return (await this.prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { paymentStatus: true },
      });

      if (options.expectedFrom !== undefined) {
        const { count } = await tx.order.updateMany({
          where: { id: orderId, paymentStatus: options.expectedFrom },
          data: { paymentStatus },
        });
        // Someone else moved the payment between the service's read and this
        // write. Nothing is written — not even the history row, because a change
        // that did not take effect is not an event.
        if (count === 0) return null;
      } else {
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus } });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changeType: OrderHistoryChangeType.PAYMENT_STATUS,
          fromPaymentStatus: existing.paymentStatus,
          toPaymentStatus: paymentStatus,
          changedBy,
        },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: ORDERS_INCLUDE,
      });
    })) as OrderWithItems | null;
  }

  /**
   * Update the operator-editable, lifecycle-neutral fields of an order
   * (TASK-335 / TASK-336).
   *
   * Only keys the caller actually supplied are written, so "set a waybill" never
   * silently clears the internal notes. An explicit `null` DOES clear — that is
   * the difference between an absent key and a null one, and the DTO turns an
   * empty string into null precisely so a cleared field reads as cleared.
   *
   * No history row: `OrderStatusHistory` records STATUS and PAYMENT_STATUS
   * changes, and stretching it to cover free-text edits would blur what the
   * timeline means.
   *
   * @throws ConflictException `ORDER_STALE` when `expectedUpdatedAt` no longer
   *   matches.
   */
  async updateDetails(
    orderId: string,
    fields: { trackingNumber?: string | null; internalNotes?: string | null },
    options: { expectedUpdatedAt?: Date } = {},
  ): Promise<OrderWithItems> {
    const data: Prisma.OrderUpdateInput = {};
    if (fields.trackingNumber !== undefined) data.trackingNumber = fields.trackingNumber;
    if (fields.internalNotes !== undefined) data.internalNotes = fields.internalNotes;

    const expectedUpdatedAt = options.expectedUpdatedAt;

    // A request that changes none of these fields is a read, not a write — and a
    // guarded `updateMany` with an empty `data` would neither express the version
    // check meaningfully nor leave the row alone.
    if (Object.keys(data).length === 0) {
      return this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: ADMIN_ORDERS_INCLUDE,
      }) as Promise<OrderWithItems>;
    }

    if (expectedUpdatedAt) {
      const { count } = await this.prisma.order.updateMany({
        where: { id: orderId, updatedAt: expectedUpdatedAt },
        data,
      });
      if (count === 0) {
        throw staleOrderError();
      }
    } else {
      await this.prisma.order.update({ where: { id: orderId }, data });
    }

    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ADMIN_ORDERS_INCLUDE,
    }) as Promise<OrderWithItems>;
  }

  /**
   * Who to email about an order, and what to call them (TASK-335).
   *
   * One narrow read rather than widening `findById`, which is on the hot path of
   * every status change: the recipient is only needed on the rare transition that
   * actually notifies someone.
   *
   * Guest details win when present because a guest order HAS no user row; an
   * order later claimed by an account keeps both, and the address the buyer
   * actually gave at checkout is the one that reached them the first time.
   */
  async findRecipient(orderId: string): Promise<{ email: string; name?: string } | null> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        guestEmail: true,
        guestName: true,
        user: { select: { email: true, firstName: true } },
      },
    });

    if (!order) return null;

    if (order.guestEmail) {
      return { email: order.guestEmail, ...(order.guestName ? { name: order.guestName } : {}) };
    }

    if (order.user?.email) {
      return {
        email: order.user.email,
        ...(order.user.firstName ? { name: order.user.firstName } : {}),
      };
    }

    return null;
  }

  /**
   * Find a guest order by the SHA-256 of the token from its confirmation email
   * (TASK-338).
   *
   * The raw token never reaches the database, so the caller hashes first and this
   * is a single indexed hit on a unique column — the same shape as the refresh and
   * password-reset token lookups. Soft-deleted orders are excluded like everywhere
   * else.
   */
  findByAccessTokenHash(accessTokenHash: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findFirst({
      where: { accessTokenHash, deletedAt: null },
      include: ORDERS_INCLUDE,
    }) as Promise<OrderWithItems | null>;
  }

  /**
   * Replace an order's access token, invalidating whatever was there before
   * (TASK-484).
   *
   * One `UPDATE` writing both columns, which is the whole safety property: the
   * hash is the only copy of the credential and `accessTokenIssuedAt` is what
   * its expiry is measured from, so a path that could set one without the other
   * would produce either an eternal link or a stillborn one. The old hash is
   * overwritten rather than kept anywhere — after this returns, the link the
   * customer had stops opening the order, which is the point of "issue a new
   * link".
   *
   * The caller hashes; the raw token never reaches this layer.
   */
  async rotateAccessToken(orderId: string, accessTokenHash: string): Promise<Date> {
    const issuedAt = new Date();
    await this.prisma.order.update({
      where: { id: orderId },
      data: { accessTokenHash, accessTokenIssuedAt: issuedAt },
    });
    return issuedAt;
  }

  /**
   * Attach previously-placed guest orders to a freshly-registered account
   * (TASK-338).
   *
   * Matches on the guest email and only touches orders that are still unclaimed
   * (`userId IS NULL`), so running it twice is harmless and a guest order already
   * claimed by one account can never be re-pointed at another. The guest columns
   * are deliberately LEFT IN PLACE: they are the snapshot of what was typed that
   * day, and the emailed status link keeps working.
   *
   * @returns how many orders were claimed.
   */
  async claimGuestOrders(userId: string, email: string): Promise<number> {
    const { count } = await this.prisma.order.updateMany({
      where: { userId: null, guestEmail: email, deletedAt: null },
      data: { userId },
    });
    return count;
  }

  /**
   * Read the Payment attempt a provider callback names, with the slice of its
   * order needed to decide what the event means (TASK-330).
   *
   * The `payments` table belongs to the payment module, but this read lives here
   * for the same reason `applyPaymentEvent` does: the order module is the only
   * thing allowed to move an order, and it cannot make that decision without
   * knowing what was originally charged. The payment module hands over an id and
   * a translated outcome; it never reads or writes order rows itself.
   *
   * Deliberately slim on the order side — a webhook is a hot path, and the
   * decision needs the current statuses, nothing more. No items, no images.
   */
  findPaymentWithOrder(paymentId: string): Promise<PaymentWithOrderRow | null> {
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        orderId: true,
        provider: true,
        providerPaymentId: true,
        amount: true,
        currency: true,
        status: true,
        order: {
          select: {
            id: true,
            status: true,
            paymentStatus: true,
            paidAt: true,
            reservationExpiresAt: true,
          },
        },
      },
    }) as Promise<PaymentWithOrderRow | null>;
  }

  /**
   * Write an already-decided payment application in ONE transaction (TASK-330).
   *
   * Every field of the plan was chosen by the service; nothing here branches on
   * business meaning. That is the point: "a partial application is how stock,
   * money and history drift apart" is only enforceable if there is exactly one
   * place a partial application could be introduced, and it is this method.
   *
   * Up to five writes commit together — the attempt's own state, the order's
   * payment status, `paidAt`, the lifted reservation deadline, the order status,
   * and one history row per status kind that actually moved. `changedBy` is null
   * on every history row: a callback has no acting user, and inventing one would
   * put a lie in the audit trail.
   */
  async applyPaymentOutcome(plan: PaymentApplyPlan): Promise<OrderWithItems> {
    return (await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: plan.paymentId },
        data: {
          status: plan.attemptStatus,
          ...(plan.providerPaymentId ? { providerPaymentId: plan.providerPaymentId } : {}),
          ...(plan.failureCode !== undefined ? { failureCode: plan.failureCode } : {}),
          ...(plan.failureMessage !== undefined ? { failureMessage: plan.failureMessage } : {}),
          ...(plan.settledAt !== undefined ? { settledAt: plan.settledAt } : {}),
        },
      });

      const orderData: Prisma.OrderUpdateInput = {};
      if (plan.paymentStatusChange) orderData.paymentStatus = plan.paymentStatusChange.to;
      if (plan.statusChange) orderData.status = plan.statusChange.to;
      if (plan.paidAt !== undefined) orderData.paidAt = plan.paidAt;
      // Lifting the deadline is unconditional once payment settled: a paid order's
      // reservation is no longer provisional, and leaving the column set would let
      // the auto-cancel worker cancel an order the customer has already paid for.
      if (plan.clearReservation) orderData.reservationExpiresAt = null;

      if (Object.keys(orderData).length > 0) {
        await tx.order.update({ where: { id: plan.orderId }, data: orderData });
      }

      if (plan.paymentStatusChange) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: plan.orderId,
            changeType: OrderHistoryChangeType.PAYMENT_STATUS,
            fromPaymentStatus: plan.paymentStatusChange.from,
            toPaymentStatus: plan.paymentStatusChange.to,
            changedBy: null,
          },
        });
      }

      // TASK-431: the event asked for a move the payment state machine forbids.
      // Nothing on the order moved — this row exists so the timeline shows that
      // the provider said something at this moment and the shop did not act on
      // it. `current → current` is the literal truth: the payment status is where
      // it was. (What was asked for is in the warning log; see the field's
      // docblock for why it is not written as a `to`.)
      if (plan.refusedPaymentStatusChange) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: plan.orderId,
            changeType: OrderHistoryChangeType.PAYMENT_STATUS,
            fromPaymentStatus: plan.refusedPaymentStatusChange.current,
            toPaymentStatus: plan.refusedPaymentStatusChange.current,
            changedBy: null,
          },
        });
      }

      if (plan.statusChange) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: plan.orderId,
            changeType: OrderHistoryChangeType.STATUS,
            fromStatus: plan.statusChange.from,
            toStatus: plan.statusChange.to,
            changedBy: null,
          },
        });
      }

      return tx.order.findUniqueOrThrow({
        where: { id: plan.orderId },
        include: ORDERS_INCLUDE,
      });
    })) as OrderWithItems;
  }

  /**
   * Read an order's full status/payment-status history, oldest-first — the
   * chronological timeline for the admin order-detail view (TASK-251).
   */
  findHistoryByOrderId(orderId: string): Promise<OrderStatusHistoryRow[]> {
    return this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { changedAt: 'asc' },
    });
  }

  /**
   * Soft-delete an order (TASK-104): stamp `deletedAt` so it is excluded from
   * every read path. Child `OrderItem` rows are left in place. Orders carry no
   * unique constraints beyond `id`, so no field mangling is needed.
   */
  softDelete(orderId: string): Promise<OrderWithItems> {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { deletedAt: new Date() },
      include: ORDERS_INCLUDE,
    }) as Promise<OrderWithItems>;
  }

  /**
   * Evict the product caches affected by a stock change: every list page plus
   * the detail (by slug and by id) of each product in the order. Called after a
   * stock decrement (createFromCart) or increment (cancelAndRestock).
   *
   * Deliberately does NOT purge the storefront's ISR cache, unlike the admin
   * write paths (TASK-384). This fires on EVERY order, and purging `/` here
   * would make the prerendered homepage regenerate on essentially every
   * checkout — turning a static page into a dynamic one on the busiest days,
   * which is exactly when the box can least afford it. The visible cost is
   * narrow and bounded: a product that sells out stays un-greyed in the
   * homepage carousels until the next admin write or the ISR timer. The cart
   * and checkout re-check stock server-side, so nobody can buy what is gone.
   * Noted rather than left silent, because an undocumented omission here is the
   * same class of bug this task closed.
   *
   * Since TASK-417 the SEARCH index is a third derived read model of the same
   * fact. Its documents carry `inStock`, and `inStock` is a Meilisearch facet
   * the results page filters on — so a sale that is not reindexed leaves
   * `/search?inStock=true` offering a product the PDP calls sold out, and a
   * restock leaves a buyable product out of «В наявності» until an admin edits
   * the card. The reindex is fired and NOT awaited: unlike the cache deletes it
   * is a network call to another box, and no checkout may wait on it.
   */
  private async evictProductCaches(items: OrderItemRow[]): Promise<void> {
    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.productId)) continue;
      seen.add(item.productId);
      await this.cache.del(productDetailSlugKey(item.product.slug));
      await this.cache.del(productDetailIdKey(item.productId));
    }
    this.reindexInBackground([...seen]);
  }

  /**
   * Best-effort, non-blocking search reindex of the products whose stock moved.
   *
   * `ProductIndexer` already swallows and logs its own failures, so the extra
   * `catch` here only covers a rejection thrown before it gets that far — a
   * stock movement must never fail because a search engine is unreachable.
   */
  private reindexInBackground(productIds: string[]): void {
    for (const productId of productIds) {
      void this.productIndexer.index(productId).catch((err: unknown) => {
        this.logger.warn(`Best-effort stock reindex failed for ${productId}: ${String(err)}`);
      });
    }
  }
}

/**
 * Convert an integer number of cents to a "XX.YY" decimal string.
 */
function centsToDecimalString(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${dollars}.${remainder.toString().padStart(2, '0')}`;
}
