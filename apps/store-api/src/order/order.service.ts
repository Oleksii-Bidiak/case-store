import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrderRepository } from './order.repository';
import { CartRepository } from '../cart/cart.repository';
import { OrderEntity } from './entities';
import type { CreateOrderDto, OrderListQueryDto } from './dto';

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
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly cartRepository: CartRepository,
  ) {}

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

    this.logger.log(`Order ${order.id} created for user ${userId}`);

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

    const cancelled = await this.orderRepository.updateStatus(orderId, OrderStatus.CANCELLED);

    this.logger.log(`Order ${orderId} cancelled by user ${userId}`);

    return OrderEntity.fromPrisma(cancelled);
  }

  /**
   * Internal — update an order's status without an ownership check.
   * Used by the payment webhook handler (TASK-034) and admin order management
   * (TASK-041).
   */
  async updateStatus(orderId: string, status: OrderStatus): Promise<OrderEntity> {
    const order = await this.orderRepository.updateStatus(orderId, status);
    return OrderEntity.fromPrisma(order);
  }
}
