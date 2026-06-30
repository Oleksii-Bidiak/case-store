import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { OrderRepository } from './order.repository';
import { CartRepository, type CartWithItems } from '../cart/cart.repository';
import { UserRepository } from '../user/user.repository';
import { MailService } from '../mail/mail.service';
import { DeliveryService } from '../delivery';
import { DiscountService } from '../discount';
import { OrderEntity } from './entities';
import type { CreateOrderDto, OrderListQueryDto, AdminOrderListQueryDto } from './dto';
import type { CreateOrderParams } from './order.types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

/**
 * Order statuses whose stock is still in the warehouse (reserved at creation,
 * not yet shipped to the customer). Cancelling an order from one of these
 * states can safely return the reserved stock to inventory automatically.
 */
const PRE_SHIPMENT_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
]);

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
    private readonly mailService: MailService,
    private readonly deliveryService: DeliveryService,
    private readonly discountService: DiscountService,
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

    // Re-validate stock at order-creation time (it may have changed since
    // add-to-cart). Each position tracks its own stock.
    for (const item of cart.items) {
      if (item.quantity > item.product.stock) {
        throw new BadRequestException(
          `Insufficient stock for "${item.product.name}" — ${item.product.stock} available`,
        );
      }
    }

    // Compute the Nova Poshta shipping cost when the order carries an NP city
    // ref (TASK-080). estimateShipping never throws (it self-falls-back to 0),
    // but we guard defensively so a delivery hiccup can never block an order.
    let shippingCost: number | undefined;
    const npCityRef = dto.shippingAddress.npCityRef;
    if (npCityRef) {
      try {
        const estimate = await this.deliveryService.estimateShipping(npCityRef);
        shippingCost = Number(estimate.cost);
      } catch (err) {
        this.logger.warn({ err, npCityRef }, 'Shipping estimate failed at order creation; using 0');
        shippingCost = 0;
      }
    }

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

    const order = await this.orderRepository.createFromCart({
      userId,
      cartId: cart.id,
      cartItems: cart.items,
      shippingAddress: dto.shippingAddress,
      billingAddress: dto.billingAddress,
      notes: dto.notes,
      ...(shippingCost !== undefined ? { shippingCost } : {}),
      ...(discount ? { discount } : {}),
    });

    this.logger.info({ event: 'order.created', orderId: order.id, userId }, 'Order created');

    const orderEntity = OrderEntity.fromPrisma(order);

    // Dispatch the confirmation email as a fault-isolated side-effect. The order
    // is already persisted and is the source of truth — a mail failure (SMTP
    // down, template crash) must never roll back the order or surface as an HTTP
    // error. Any error is caught and logged; createOrder always returns the
    // created order. The recipient is the user fetched by the ban guard above.
    try {
      await this.mailService.sendOrderConfirmation({
        to: user.email,
        order: orderEntity,
        customerName: user.firstName ?? undefined,
      });
      this.logger.info(
        { event: 'order.email_sent', orderId: order.id, to: user.email },
        'Order confirmation email sent',
      );
    } catch (err) {
      // Structured fields ({ err, orderId }) so the failure is queryable in log
      // aggregation, not just a formatted string.
      this.logger.error({ err, orderId: order.id }, 'Failed to send order confirmation email');
    }

    return orderEntity;
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
    const cancelled = await this.orderRepository.cancelAndRestock(orderId);

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
   */
  async updateStatus(orderId: string, status: OrderStatus): Promise<OrderEntity> {
    const existing = await this.orderRepository.findById(orderId);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    // Pre-shipment cancellation: return the reserved stock to inventory and
    // evict product caches in one transaction (reuses the customer-cancel path).
    // Post-shipment cancels and refunds are deliberately NOT auto-restocked —
    // the physical return must be received and re-stocked by hand (TASK-124).
    if (shouldAutoRestock(existing.status, status)) {
      const restocked = await this.orderRepository.cancelAndRestock(orderId);
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
    const order = await this.orderRepository.updateStatus(orderId, status, existing.paymentStatus);
    return OrderEntity.fromPrisma(order);
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
  ): Promise<OrderEntity> {
    const existing = await this.orderRepository.findById(orderId);

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    const order = await this.orderRepository.updatePaymentStatus(orderId, paymentStatus);

    this.logger.info(
      { event: 'order.payment_status_updated', orderId, paymentStatus },
      'Order payment status updated',
    );

    return OrderEntity.fromPrisma(order);
  }
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
