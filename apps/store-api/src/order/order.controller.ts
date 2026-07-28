import {
  BadRequestException,
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
  UseInterceptors,
  type ExecutionContext,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiParam,
  ApiQuery,
  ApiProperty,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OrderService, PaginationMeta } from './order.service';
import { OrderEntity, OrderItemEntity, OrderGuestData } from './entities';
import { CreateOrderDto, OrderListQueryDto } from './dto';
import { JwtAuthGuard, RolesGuard, CurrentUser } from '../auth';
import { OptionalJwtAuthGuard } from '../cart/guards';
import { CartIdentityInterceptor } from '../cart/interceptors';
import { CartIdentity } from '../cart/decorators';
import type { ResolvedCartIdentity } from '../cart/cart-identity.types';
import type { OrderActor } from './order.types';

/**
 * Turn the cart module's resolved identity into an {@link OrderActor} (TASK-338).
 *
 * This is where the "exactly one of account / guest" invariant is established, and
 * it is established from the CART IDENTITY rather than from the request body. That
 * ordering is the security-relevant part: a signed-in shopper cannot post a
 * `contact` block and have their confirmation email — which carries an order-access
 * link — redirected to an address of their choosing. For them the block is simply
 * ignored, and the account remains the source of truth.
 *
 * @throws BadRequestException when a guest omits the contact details. There is no
 *   sensible default: without an email the buyer can never be told the order
 *   exists, and without a phone the courier cannot deliver it.
 */
function toOrderActor(identity: ResolvedCartIdentity, dto: CreateOrderDto): OrderActor {
  if (identity.type === 'user') {
    return { type: 'user', userId: identity.userId };
  }

  if (!dto.contact) {
    throw new BadRequestException(
      'Contact details (name, email, phone) are required to order without an account',
    );
  }

  return { type: 'guest', cartToken: identity.token, contact: dto.contact };
}

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

/**
 * Per-request order-creation limit (TASK-338).
 *
 * `@nestjs/throttler` resolves `limit` per request, which is what lets ONE route
 * serve accounts and guests at different rates without a second named throttler
 * in the shared app config.
 *
 * A guest gets a third of an account's allowance because a guest order costs
 * nothing to place and everything to clean up: no login, no verified address,
 * real stock reserved, and an email dispatched to whatever inbox was typed. The
 * account limit stays where TASK-103 put it.
 */
const ACCOUNT_ORDER_LIMIT = 10;
const GUEST_ORDER_LIMIT = 3;

function orderCreationLimit(context: ExecutionContext): number {
  const request = context.switchToHttp().getRequest<{ user?: { id?: string } }>();
  return request.user?.id ? ACCOUNT_ORDER_LIMIT : GUEST_ORDER_LIMIT;
}

@ApiTags('Orders')
@ApiBearerAuth('access-token')
@ApiExtraModels(
  OrderEntity,
  OrderItemEntity,
  OrderGuestData,
  StorefrontPaginationMeta,
  OrderResponseEnvelope,
  OrderListResponseEnvelope,
)
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * POST /api/orders
   *
   * Create an order from the caller's current cart — an account's or a guest's
   * (TASK-338).
   *
   * The auth guard is gone from this route on purpose. A guest could always FILL
   * a cart; the barrier stood exactly here, which made the storefront's "order in
   * two minutes, no registration" promise untrue. Identity now comes from the
   * cart module's own resolution — a JWT when there is one, the `cartToken`
   * cookie otherwise — which is the same identity that owns the cart being
   * converted, so there is no way to check out someone else's basket.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(CartIdentityInterceptor)
  @ApiCookieAuth('cart-token')
  // Order placement mutates stock and dispatches mail — far more expensive than a
  // read, and a natural abuse target. Cap it well below the global 100/60s, and
  // tighter still for guests (see orderCreationLimit).
  @Throttle({ default: { limit: orderCreationLimit, ttl: 60000 } })
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
  @ApiResponse({
    status: 400,
    description: 'Empty cart, insufficient stock, or missing guest contact details',
  })
  @ApiResponse({ status: 404, description: 'Cart not found' })
  async createOrder(
    @CartIdentity() identity: ResolvedCartIdentity,
    @Body() dto: CreateOrderDto,
  ): Promise<{ data: OrderEntity }> {
    const order = await this.orderService.createOrder(toOrderActor(identity, dto), dto);
    return { data: order };
  }

  /**
   * GET /api/orders/guest/:token
   *
   * A guest's view of their own order, opened from the link in their confirmation
   * email (TASK-338).
   *
   * Public by necessity — there is no account to authenticate against. The token
   * IS the credential: 256 bits of entropy, stored only as a SHA-256, and valid
   * for a bounded window. Without this endpoint a guest goes blind the moment the
   * cart cookie expires or they open the email on their phone (edge case E-17).
   *
   * Rate-limited hard: this is the one route where a valid guess would hand over
   * somebody else's order.
   */
  @Get('guest/:token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Get a guest order by its emailed token', operationId: 'getGuestOrder' })
  @ApiParam({ name: 'token', description: 'Opaque access token from the confirmation email' })
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
  @ApiResponse({
    status: 404,
    description:
      'No order for this token, or the link has expired (deliberately indistinguishable)',
  })
  async getGuestOrder(@Param('token') token: string): Promise<{ data: OrderEntity }> {
    const order = await this.orderService.getGuestOrder(token);
    return { data: order };
  }

  /**
   * GET /api/orders
   *
   * List the authenticated user's orders (paginated, newest first).
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
}
