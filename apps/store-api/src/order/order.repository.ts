import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma, OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  CacheService,
  productDetailIdKey,
  productDetailSlugKey,
  PRODUCT_LIST_PREFIX,
} from '../cache';
import type { CreateOrderParams, OrderWithItems, OrderItemRow } from './order.types';
import type { OrderListQueryDto, AdminOrderListQueryDto } from './dto';

/**
 * Shared Prisma include clause for order queries. Always fetches the order
 * lines (ordered by creation) with the minimal product/variant reference data
 * needed to render an order, mirroring the `CART_ITEMS_INCLUDE` pattern.
 */
const ORDERS_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      orderId: true,
      productId: true,
      variantId: true,
      quantity: true,
      price: true,
      createdAt: true,
      product: { select: { id: true, name: true, slug: true } },
      variant: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.OrderInclude;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

@Injectable()
export class OrderRepository {
  private readonly logger = new Logger(OrderRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
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
  async createFromCart(params: CreateOrderParams): Promise<OrderWithItems> {
    const { userId, cartId, cartItems, shippingAddress, billingAddress, notes } = params;

    // Snapshot each line's unit price (variant price if present, otherwise
    // product price) into the order-item rows. These persisted rows — not the
    // cart — are the order's source of truth from here on.
    const itemData = cartItems.map((item) => {
      const priceStr = item.variant ? item.variant.price.toString() : item.product.price.toString();
      return {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        price: new Prisma.Decimal(priceStr),
      };
    });

    // Derive the subtotal from the persisted order-item rows themselves (single
    // source of truth) using integer-cents arithmetic to avoid float drift.
    const subtotalCents = itemData.reduce(
      (cents, item) => cents + Math.round(item.price.toNumber() * 100) * item.quantity,
      0,
    );
    const subtotal = new Prisma.Decimal(centsToDecimalString(subtotalCents));

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          subtotal,
          discount: new Prisma.Decimal(0),
          shippingCost: new Prisma.Decimal(0),
          tax: new Prisma.Decimal(0),
          // Phase 3 MVP: no discount/shipping/tax — total equals subtotal.
          total: subtotal,
          shippingAddress: shippingAddress as unknown as Prisma.InputJsonValue,
          billingAddress: (billingAddress ?? shippingAddress) as unknown as Prisma.InputJsonValue,
          notes: notes ?? null,
          items: { create: itemData },
        },
        include: ORDERS_INCLUDE,
      });

      // Empty the originating cart so it cannot be ordered twice.
      await tx.cartItem.deleteMany({ where: { cartId } });

      // Authoritative inventory decrement for variant lines. The conditional
      // `WHERE stock >= quantity` makes this safe under concurrency: if a
      // racing order already consumed the stock, `count` is 0 and we throw,
      // rolling back the whole transaction (no order, no cart clear, no
      // partial decrement). Stock can therefore never go negative.
      for (const item of cartItems) {
        if (item.variantId) {
          const { count } = await tx.productVariant.updateMany({
            where: { id: item.variantId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (count === 0) {
            throw new ConflictException(
              `Insufficient stock for "${item.product.name}" — please review your cart`,
            );
          }
        }
      }

      return created;
    });

    // Stock for the ordered variants just changed — evict their detail caches
    // (variant stock is rendered on detail pages) and all list pages. Eviction
    // errors are swallowed inside CacheService, so they never affect the order.
    await this.evictProductCaches((order as OrderWithItems).items);

    return order as OrderWithItems;
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

    const createdAt: Prisma.DateTimeFilter = {};
    if (query.dateFrom) createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) createdAt.lte = new Date(query.dateTo);

    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo ? { createdAt } : {}),
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
   * Find a single order by ID, or null if it does not exist. Excludes
   * soft-deleted orders (`deletedAt IS NOT NULL`). Because every mutating path
   * (`updateStatus`, `cancelAndRestock`, `markPaid`) is gated behind a service
   * call to this method, soft-deleted orders are uniformly unreachable.
   */
  findById(orderId: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: ORDERS_INCLUDE,
    }) as Promise<OrderWithItems | null>;
  }

  /**
   * Update an order's status. Ownership and transition validity are enforced
   * by the service before this is called.
   */
  updateStatus(orderId: string, status: OrderStatus): Promise<OrderWithItems> {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: ORDERS_INCLUDE,
    }) as Promise<OrderWithItems>;
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
   * `confirm-payment` action: confirm keeps the stock, cancel releases it.
   */
  async cancelAndRestock(orderId: string): Promise<OrderWithItems> {
    const updated = (await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: ORDERS_INCLUDE,
      });

      for (const item of order.items) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
        include: ORDERS_INCLUDE,
      });
    })) as OrderWithItems;

    // Restock changed variant stock — evict the same caches as createFromCart.
    await this.evictProductCaches(updated.items);

    return updated;
  }

  /**
   * Update an order's payment status. Called by the payment webhook handler
   * (TASK-034).
   */
  updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus): Promise<OrderWithItems> {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus },
      include: ORDERS_INCLUDE,
    }) as Promise<OrderWithItems>;
  }

  /**
   * Mark an order as paid: set payment status to PAID and advance the order to
   * CONFIRMED in a single update. Used by the admin "payment received" action
   * (a manual stand-in until the Stripe webhook of TASK-034 lands). The service
   * enforces that only a PENDING order reaches this point.
   */
  markPaid(orderId: string): Promise<OrderWithItems> {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: PaymentStatus.PAID, status: OrderStatus.CONFIRMED },
      include: ORDERS_INCLUDE,
    }) as Promise<OrderWithItems>;
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
