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
import { CurrentUser } from '../auth';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
  ApiQuery,
  ApiExtraModels,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OrderStatus } from '@prisma/client';
import { OrderService } from './order.service';
import {
  OrderEntity,
  OrderItemEntity,
  OrderCustomerData,
  OrderStatusHistoryEntity,
} from './entities';
import {
  AdminOrderListQueryDto,
  UpdateOrderStatusDto,
  UpdateOrderPaymentStatusDto,
  UpdateOrderDetailsDto,
  CreateManualOrderDto,
} from './dto';
import { PermissionGuard, RequirePermission } from '../auth/permissions';

/**
 * Pagination metadata for paginated admin order lists.
 */
class AdminOrderPaginationMeta {
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
 * Response envelope for a paginated admin order list.
 *
 * Declared as a decorated class (not a bare interface) so Swagger emits a
 * schema and Orval generates a typed client hook for `GET /api/admin/orders`.
 */
class AdminOrderListResponse {
  @ApiProperty({ type: [OrderEntity], description: 'Orders for the current page (all users)' })
  data!: OrderEntity[];

  @ApiProperty({ type: AdminOrderPaginationMeta })
  meta!: AdminOrderPaginationMeta;
}

/**
 * Response envelope for a single order.
 *
 * Decorated class (not a bare interface) so Swagger emits a `{ data }` schema
 * matching the runtime payload, and Orval generates a typed client hook.
 */
class AdminOrderResponseEnvelope {
  @ApiProperty({ type: OrderEntity })
  data!: OrderEntity;
}

/**
 * Response envelope for an order's status/payment-status history timeline
 * (TASK-251). Oldest-first list of {@link OrderStatusHistoryEntity} rows.
 */
class AdminOrderHistoryResponse {
  @ApiProperty({
    type: [OrderStatusHistoryEntity],
    description: 'Status/payment-status history for the order, oldest-first',
  })
  data!: OrderStatusHistoryEntity[];
}

/**
 * Response envelope for the transitions an order may currently make (TASK-332).
 *
 * `updatedAt` is part of the answer, not decoration: it is the optimistic-lock
 * token the client hands straight back on the follow-up PATCH, so read-decide-write
 * is guarded without a second round trip.
 */
class AdminOrderAllowedTransitions {
  @ApiProperty({ description: "The order's current status", enum: OrderStatus })
  current!: OrderStatus;

  @ApiProperty({
    description: 'Statuses the order may legally move to right now',
    enum: OrderStatus,
    isArray: true,
  })
  allowed!: OrderStatus[];

  @ApiProperty({
    description:
      "The order's current `updatedAt` — send it back as `expectedUpdatedAt` on the " +
      'status PATCH to detect a concurrent edit.',
    example: '2026-07-28T10:15:30.000Z',
  })
  updatedAt!: Date;
}

class AdminOrderAllowedTransitionsResponse {
  @ApiProperty({ type: AdminOrderAllowedTransitions })
  data!: AdminOrderAllowedTransitions;
}

/**
 * Controller for admin order management endpoints.
 *
 * Admin endpoints (ADMIN role required):
 *   POST   /admin/orders                              — Operator-created (phone) order (341)
 *   GET    /admin/orders                              — List all orders across all users
 *   GET    /admin/orders/:orderId                     — Get any order by ID
 *   GET    /admin/orders/:orderId/allowed-transitions — Legal next statuses (TASK-332)
 *   PATCH  /admin/orders/:orderId                     — Waybill / internal notes (335, 336)
 *   PATCH  /admin/orders/:orderId/status              — Update an order's status
 *   PATCH  /admin/orders/:orderId/payment-status      — Update an order's payment status
 *
 * Separate from the customer-facing {@link OrderController} (`/api/orders`),
 * which scopes every route to the authenticated user. Mirrors the
 * AdminCategoryController vs CategoryController split.
 */
@ApiTags('Admin Orders')
@ApiExtraModels(
  OrderEntity,
  OrderItemEntity,
  OrderCustomerData,
  OrderStatusHistoryEntity,
  AdminOrderListResponse,
  AdminOrderPaginationMeta,
  AdminOrderResponseEnvelope,
  AdminOrderHistoryResponse,
  AdminOrderAllowedTransitions,
  AdminOrderAllowedTransitionsResponse,
)
@Controller('admin/orders')
@UseGuards(PermissionGuard)
@RequirePermission('orders:read')
export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * GET /api/admin/orders
   *
   * Returns a paginated list of all orders across all users. Supports
   * filtering by status, user, and created-at date range. Admin-only.
   */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all orders (admin)', operationId: 'adminOrderControllerFindAll' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Sort field: createdAt | total | status',
  })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'Sort order: asc | desc' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of orders',
    type: AdminOrderListResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAll(@Query() query: AdminOrderListQueryDto): Promise<AdminOrderListResponse> {
    return this.orderService.adminGetAllOrders(query);
  }

  /**
   * POST /api/admin/orders
   *
   * Create an order on the customer's behalf — a phone order (TASK-341). Prices
   * come from the live catalogue, never from the request.
   */
  @Post()
  // Integration fix: WT-A wrote this route while WT-C was migrating the guards,
  // so it arrived carrying only the class-level `orders:read`. Creating an order
  // on someone's behalf — taking their money and their stock — is emphatically a
  // write, and inheriting a read permission would have handed it to every role
  // allowed merely to LOOK at orders.
  @RequirePermission('orders:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Create an order on behalf of a customer (admin)',
    operationId: 'adminOrderControllerCreate',
  })
  @ApiResponse({ status: 201, description: 'Order created', type: AdminOrderResponseEnvelope })
  @ApiResponse({
    status: 400,
    description: 'No customer identified, a product is unavailable, or stock is short',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(
    @Body() dto: CreateManualOrderDto,
    // Recorded as the history row's changedBy: unlike a self-service order, this
    // one has an acting user, and that is the point of auditing manual orders.
    @CurrentUser('id') adminUserId: string,
  ): Promise<AdminOrderResponseEnvelope> {
    const order = await this.orderService.adminCreateOrder(dto, adminUserId);

    return { data: order };
  }

  /**
   * GET /api/admin/orders/:orderId
   *
   * Returns any single order by ID (no ownership check). Admin-only.
   */
  @Get(':orderId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get order by ID (admin)', operationId: 'adminOrderControllerFindById' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: 'Order found', type: AdminOrderResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findById(@Param('orderId') orderId: string): Promise<AdminOrderResponseEnvelope> {
    const order = await this.orderService.adminGetOrder(orderId);

    return { data: order };
  }

  /**
   * GET /api/admin/orders/:orderId/history
   *
   * Returns the order's full status/payment-status change timeline, oldest-first
   * (TASK-251). Admin-only. 404 when the order does not exist / is soft-deleted.
   */
  @Get(':orderId/history')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get order status history (admin)',
    operationId: 'adminOrderControllerGetHistory',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order status/payment-status history (oldest-first)',
    type: AdminOrderHistoryResponse,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async getHistory(@Param('orderId') orderId: string): Promise<AdminOrderHistoryResponse> {
    const data = await this.orderService.getOrderHistory(orderId);

    return { data };
  }

  /**
   * GET /api/admin/orders/:orderId/allowed-transitions
   *
   * The statuses this order may legally move to right now (TASK-332), so the
   * admin UI offers exactly those instead of "every status except the current
   * one" and letting the operator discover the truth from a 409.
   */
  @Get(':orderId/allowed-transitions')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List legal next statuses for an order (admin)',
    operationId: 'adminOrderControllerGetAllowedTransitions',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Current status, the legal targets, and the optimistic-lock token',
    type: AdminOrderAllowedTransitionsResponse,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async getAllowedTransitions(
    @Param('orderId') orderId: string,
  ): Promise<AdminOrderAllowedTransitionsResponse> {
    const data = await this.orderService.getAllowedTransitions(orderId);

    return { data };
  }

  /**
   * PATCH /api/admin/orders/:orderId/status
   *
   * Update an order's status. Admin-only. TASK-332: the transition is validated
   * against the server-side state machine — an illegal move is refused with 409
   * `ORDER_TRANSITION_INVALID` and appends nothing to the order's history. Pass
   * `expectedUpdatedAt` (from the order or the allowed-transitions read) to also
   * detect a concurrent edit by another admin: 409 `ORDER_STALE`.
   */
  @Patch(':orderId/status')
  @RequirePermission('orders:write')
  @ApiBearerAuth('access-token')
  // Admin-only state mutation; throttle to blunt scripted misuse even from an
  // authenticated admin token (mirrors the payment-status route).
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Update order status (admin)',
    operationId: 'adminOrderControllerUpdateStatus',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order status updated',
    type: AdminOrderResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 409,
    description:
      'ORDER_TRANSITION_INVALID — the state machine forbids this move; or ORDER_STALE — ' +
      'another admin changed this order first',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async updateStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
    // TASK-251: the acting admin is recorded as the history row's changedBy.
    @CurrentUser('id') adminUserId: string,
  ): Promise<AdminOrderResponseEnvelope> {
    const order = await this.orderService.updateStatus(orderId, dto.status, adminUserId, {
      // The DTO carries an ISO string on purpose (see its docblock); this is the
      // single, explicit conversion.
      ...(dto.expectedUpdatedAt ? { expectedUpdatedAt: new Date(dto.expectedUpdatedAt) } : {}),
    });

    return { data: order };
  }

  /**
   * PATCH /api/admin/orders/:orderId
   *
   * Update the operator-editable fields that are not part of the order's
   * lifecycle: the Nova Poshta waybill (TASK-335) and the internal notes
   * (TASK-336). Admin-only.
   *
   * Entering a waybill on an order that has already SHIPPED sends the customer
   * their tracking notice — the second half of the "mark it gone, then get the
   * number from the courier" workflow.
   */
  @Patch(':orderId')
  // Same integration fix as POST above: a write that landed inheriting the
  // class-level read permission.
  @RequirePermission('orders:write')
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Update order tracking number / internal notes (admin)',
    operationId: 'adminOrderControllerUpdateDetails',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order updated',
    type: AdminOrderResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'ORDER_STALE — another admin changed this order first' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async updateDetails(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderDetailsDto,
  ): Promise<AdminOrderResponseEnvelope> {
    const lock = {
      ...(dto.expectedUpdatedAt ? { expectedUpdatedAt: new Date(dto.expectedUpdatedAt) } : {}),
    };

    // TASK-341: the address edit has its own pre-shipment rule, so it goes
    // through its own service method rather than being smuggled into the details
    // write. Applied FIRST: if the order has already shipped the whole request
    // fails with 409 and nothing at all is written, rather than the operator
    // getting a half-applied edit whose refused half they have to notice.
    let addressApplied = false;
    if (dto.shippingAddress) {
      await this.orderService.adminUpdateShippingAddress(orderId, dto.shippingAddress, lock);
      addressApplied = true;
    }

    const order = await this.orderService.adminUpdateDetails(
      orderId,
      {
        // Only forward keys the caller actually sent: an absent key leaves the
        // field alone, an explicit null clears it.
        ...(dto.trackingNumber !== undefined ? { trackingNumber: dto.trackingNumber } : {}),
        ...(dto.internalNotes !== undefined ? { internalNotes: dto.internalNotes } : {}),
      },
      // The version token is spent by whichever write goes first. If the address
      // was just applied, the row's `updatedAt` has already moved on — re-checking
      // the caller's now-superseded token here would reject this request's own
      // second half as a concurrent edit by itself.
      addressApplied ? {} : lock,
    );

    return { data: order };
  }

  /**
   * PATCH /api/admin/orders/:orderId/payment-status
   *
   * Set an order's payment status directly, independently of its order status
   * (TASK-151). This is the supported way for an admin to mark an order
   * paid/unpaid/refunded; it never changes the order status. Admin-only.
   */
  @Patch(':orderId/payment-status')
  @RequirePermission('orders:write')
  @ApiBearerAuth('access-token')
  // Admin-only state mutation; throttle to blunt scripted misuse even from an
  // authenticated admin token (mirrors the status route).
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Update order payment status (admin)',
    operationId: 'adminOrderControllerUpdatePaymentStatus',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'Order payment status updated',
    type: AdminOrderResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async updatePaymentStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderPaymentStatusDto,
    // TASK-251: the acting admin is recorded as the history row's changedBy.
    @CurrentUser('id') adminUserId: string,
  ): Promise<AdminOrderResponseEnvelope> {
    const order = await this.orderService.adminUpdatePaymentStatus(
      orderId,
      dto.paymentStatus,
      adminUserId,
    );

    return { data: order };
  }
}
