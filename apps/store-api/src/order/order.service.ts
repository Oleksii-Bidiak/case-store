import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { OrderStatus } from '@prisma/client';
import { OrderRepository } from './order.repository';
import { CartRepository } from '../cart/cart.repository';
import { UserRepository } from '../user/user.repository';
import { MailService } from '../mail/mail.service';
import { OrderEntity } from './entities';
import type { CreateOrderDto, OrderListQueryDto, AdminOrderListQueryDto } from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

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
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OrderService.name);
  }

  /**
   * Create an order from the user's current cart.
   *
   * @throws NotFoundException when the user has no cart.
   * @throws BadRequestException when the cart is empty or a variant has
   *   insufficient stock at order-creation time.
   */
  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderEntity> {
    const cart = await this.cartRepository.findByUserId(userId);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty — add items before placing an order');
    }

    // Re-validate stock at order-creation time (it may have changed since
    // add-to-cart). Only variant lines track stock.
    for (const item of cart.items) {
      if (item.variant && item.quantity > item.variant.stock) {
        throw new BadRequestException(
          `Insufficient stock for "${item.product.name}" — ${item.variant.stock} available`,
        );
      }
    }

    const order = await this.orderRepository.createFromCart({
      userId,
      cartId: cart.id,
      cartItems: cart.items,
      shippingAddress: dto.shippingAddress,
      billingAddress: dto.billingAddress,
      notes: dto.notes,
    });

    this.logger.info(`Order ${order.id} created for user ${userId}`);

    const orderEntity = OrderEntity.fromPrisma(order);

    // Dispatch the confirmation email as a fault-isolated side-effect. The order
    // is already persisted and is the source of truth — a mail failure (SMTP
    // down, null user, template crash) must never roll back the order or surface
    // as an HTTP error. Any error is caught and logged; createOrder always
    // returns the created order.
    try {
      const user = await this.userRepository.findById(userId);
      if (user) {
        await this.mailService.sendOrderConfirmation({
          to: user.email,
          order: orderEntity,
          customerName: user.firstName ?? undefined,
        });
        this.logger.info(`Order confirmation email sent to ${user.email} for order ${order.id}`);
      }
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
    const order = await this.orderRepository.findById(orderId);

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

    this.logger.info(`Order ${orderId} cancelled by user ${userId}; reserved stock released`);

    return OrderEntity.fromPrisma(cancelled);
  }

  /**
   * Admin — register that payment for an order was received and confirm it.
   *
   * Sets the order's payment status to PAID and advances it from PENDING to
   * CONFIRMED. This is a manual stand-in for the Stripe payment webhook
   * (TASK-034): until automated payments exist, an admin marks orders paid by
   * hand. Authorization (ADMIN role) is enforced at the controller.
   *
   * @throws NotFoundException when the order does not exist.
   * @throws ConflictException when the order is not PENDING (already paid,
   *   cancelled, refunded, or further along its lifecycle).
   */
  async confirmPayment(orderId: string): Promise<OrderEntity> {
    const order = await this.orderRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException('Only PENDING orders can be marked as paid');
    }

    const paid = await this.orderRepository.markPaid(orderId);

    this.logger.info(`Order ${orderId} marked PAID and CONFIRMED (admin)`);

    return OrderEntity.fromPrisma(paid);
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

    const order = await this.orderRepository.updateStatus(orderId, status);
    return OrderEntity.fromPrisma(order);
  }
}
