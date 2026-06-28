import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiProperty,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { OrderService, PaginationMeta } from './order.service';
import { OrderEntity, OrderItemEntity } from './entities';
import { CreateOrderDto, OrderListQueryDto } from './dto';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../auth';

/**
 * Pagination metadata for paginated storefront order lists.
 *
 * Decorated class mirroring the {@link PaginationMeta} interface so Swagger can
 * emit a schema (interfaces carry no decorators). Runtime shape is identical.
 */
class StorefrontPaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 42 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 5 })
  totalPages!: number;
}

/**
 * Response envelope for a single order.
 */
class OrderResponseEnvelope {
  @ApiProperty({ type: OrderEntity })
  data!: OrderEntity;
}

/**
 * Response envelope for a paginated list of orders.
 *
 * Decorated class (not a bare interface) so Swagger emits a full schema and
 * Orval generates a typed `data: OrderEntity[]` client model.
 */
class OrderListResponseEnvelope {
  @ApiProperty({ type: [OrderEntity], description: 'Orders for the current page' })
  data!: OrderEntity[];

  @ApiProperty({ type: StorefrontPaginationMeta })
  meta!: StorefrontPaginationMeta;
}

@ApiTags('Orders')
@ApiBearerAuth('access-token')
@ApiExtraModels(
  OrderEntity,
  OrderItemEntity,
  StorefrontPaginationMeta,
  OrderResponseEnvelope,
  OrderListResponseEnvelope,
)
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * POST /api/orders
   *
   * Create an order from the authenticated user's current cart.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  // Order placement mutates stock and dispatches mail — far more expensive than a
  // read, and a natural abuse target. Cap it well below the global 100/60s.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create order from cart', operationId: 'createOrder' })
  @ApiResponse({
    status: 201,
    description: 'Order created',
    schema: {
      allOf: [
        { $ref: getSchemaPath(OrderResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(OrderEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Empty cart or insufficient stock' })
  @ApiResponse({ status: 404, description: 'Cart not found' })
  async createOrder(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOrderDto,
  ): Promise<{ data: OrderEntity }> {
    const order = await this.orderService.createOrder(userId, dto);
    return { data: order };
  }

  /**
   * GET /api/orders
   *
   * List the authenticated user's orders (paginated, newest first).
   */
  @Get()
  @ApiOperation({ summary: 'List current user orders', operationId: 'getOrders' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by order status' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 100)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of orders',
    type: OrderListResponseEnvelope,
  })
  async getOrders(
    @CurrentUser('id') userId: string,
    @Query() query: OrderListQueryDto,
  ): Promise<{ data: OrderEntity[]; meta: PaginationMeta }> {
    return this.orderService.getOrders(userId, query);
  }

  /**
   * GET /api/orders/:orderId
   *
   * Get a single order owned by the authenticated user.
   */
  @Get(':orderId')
  @ApiOperation({ summary: 'Get order by ID', operationId: 'getOrder' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order details',
    schema: {
      allOf: [
        { $ref: getSchemaPath(OrderResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(OrderEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getOrder(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
  ): Promise<{ data: OrderEntity }> {
    const order = await this.orderService.getOrder(userId, orderId);
    return { data: order };
  }

  /**
   * PATCH /api/orders/:orderId/cancel
   *
   * Cancel a PENDING order owned by the authenticated user.
   */
  @Patch(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel a pending order', operationId: 'cancelOrder' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled',
    schema: {
      allOf: [
        { $ref: getSchemaPath(OrderResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(OrderEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Order cannot be cancelled in its current status' })
  async cancelOrder(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
  ): Promise<{ data: OrderEntity }> {
    const order = await this.orderService.cancelOrder(userId, orderId);
    return { data: order };
  }

  /**
   * PATCH /api/orders/:orderId/confirm-payment
   *
   * Admin action: register that payment was received and confirm the order
   * (PENDING → CONFIRMED, paymentStatus → PAID). Manual stand-in for the
   * payment webhook until Stripe integration (TASK-034) lands.
   *
   * @deprecated Superseded by `PATCH /api/admin/orders/:id/payment-status`
   *   (TASK-151), which sets the payment status independently of the order
   *   status. Retained until external consumers are confirmed migrated.
   */
  @Patch(':orderId/confirm-payment')
  @Roles(UserRole.ADMIN)
  // Admin-only state transition that confirms an order; throttle to blunt any
  // scripted misuse even from an authenticated admin token.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary:
      '[DEPRECATED — use PATCH /admin/orders/:id/payment-status] Mark payment received and confirm order (admin)',
    operationId: 'confirmOrderPayment',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Payment recorded, order confirmed',
    schema: {
      allOf: [
        { $ref: getSchemaPath(OrderResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(OrderEntity) } } },
      ],
    },
  })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Order is not PENDING' })
  async confirmOrderPayment(@Param('orderId') orderId: string): Promise<{ data: OrderEntity }> {
    const order = await this.orderService.confirmPayment(orderId);
    return { data: order };
  }
}
