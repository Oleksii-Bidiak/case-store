import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma, OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import type { CreateOrderParams, OrderWithItems } from './order.types';
import type { OrderListQueryDto } from './dto';

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

  constructor(private readonly prisma: PrismaService) {}

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

    // Snapshot unit prices (variant price if present, otherwise product price)
    // and compute the subtotal with cents arithmetic to avoid float errors.
    let subtotalCents = 0;
    const itemData = cartItems.map((item) => {
      const priceStr = item.variant ? item.variant.price.toString() : item.product.price.toString();
      subtotalCents += Math.round(parseFloat(priceStr) * 100) * item.quantity;
      return {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        price: new Prisma.Decimal(priceStr),
      };
    });

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
   * Find a single order by ID, or null if it does not exist.
   */
  findById(orderId: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findUnique({
      where: { id: orderId },
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
  cancelAndRestock(orderId: string): Promise<OrderWithItems> {
    return this.prisma.$transaction(async (tx) => {
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
    }) as Promise<OrderWithItems>;
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
}

/**
 * Convert an integer number of cents to a "XX.YY" decimal string.
 */
function centsToDecimalString(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${dollars}.${remainder.toString().padStart(2, '0')}`;
}
