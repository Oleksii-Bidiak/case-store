import { Controller, Get, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
} from '@nestjs/swagger';
import { OrderService } from './order.service';
import { OrderEntity, OrderItemEntity, OrderCustomerData } from './entities';
import { AdminOrderListQueryDto, UpdateOrderStatusDto } from './dto';
import { AdminGuard } from '../auth/guards';

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
 * Controller for admin order management endpoints.
 *
 * Admin endpoints (ADMIN role required):
 *   GET    /admin/orders                  — List all orders across all users
 *   GET    /admin/orders/:orderId         — Get any order by ID
 *   PATCH  /admin/orders/:orderId/status  — Update an order's status
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
  AdminOrderListResponse,
  AdminOrderPaginationMeta,
  AdminOrderResponseEnvelope,
)
@Controller('admin/orders')
@UseGuards(AdminGuard)
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
   * PATCH /api/admin/orders/:orderId/status
   *
   * Update an order's status (any transition). Admin-only. Transition
   * sensibility is enforced in the admin UI; the backend records the requested
   * status directly.
   */
  @Patch(':orderId/status')
  @ApiBearerAuth('access-token')
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
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async updateStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<AdminOrderResponseEnvelope> {
    const order = await this.orderService.updateStatus(orderId, dto.status);

    return { data: order };
  }
}
