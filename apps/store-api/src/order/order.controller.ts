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
  ApiPropertyOptional,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OrderStatus } from '@prisma/client';
import { FailClosedThrottle, OrderLookupThrottle } from '../throttler';
import { OrderService } from './order.service';
import type { PaginationMeta } from '../common/pagination';
import {
  OrderEntity,
  OrderItemEntity,
  OrderGuestData,
  PublicOrderEntity,
  PublicOrderItemEntity,
  PublicOrderDeliveryEntity,
} from './entities';
import { CreateOrderDto, OrderListQueryDto, OrderLookupDto } from './dto';
// `RolesGuard` is gone (TASK-475): it carried no `@Roles` metadata at any of its
// call sites, so it returned true for every authenticated caller. The real
// requirement on these routes is authentication plus the ownership check the
// service performs, which `JwtAuthGuard` alone already states. The set of callers
// admitted is unchanged.
import { JwtAuthGuard, CurrentUser } from '../auth';
import {
  CartIdentity,
  CartIdentityInterceptor,
  OptionalJwtAuthGuard,
  type ResolvedCartIdentity,
} from '../cart';
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
 * The order as `POST /orders` answers it (TASK-679): the same order every read
 * returns, plus — for a GUEST order only — the access token the confirmation
 * letter carries. A separate class on purpose: the token is never part of
 * {@link OrderEntity}, so no read can ever hand it out (only its hash is stored).
 */
class CreatedOrderEntity extends OrderEntity {
  @ApiPropertyOptional({
    description:
      'GUEST orders only, and only in this create response: the raw order access token — the ' +
      'same one the confirmation e-mail carries. It opens `GET /orders/guest/{token}` and the ' +
      "guest's Telegram routes (`/orders/guest/{token}/notifications/telegram`). Absent for an " +
      'account order. Never returned again by any read; keep it client-side for this session.',
    example: '9f2c4e1a7b3d5f60819a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70',
  })
  guestAccessToken?: string;
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
 * Response envelope for the public order lookup (TASK-483).
 *
 * A LIST even though a hit is almost always one order: an 8-character UUID
 * prefix can collide, and a collision that also matched the phone belongs to the
 * same person. Returning "the first one" would silently show the wrong order.
 */
class PublicOrderLookupResponseEnvelope {
  @ApiProperty({ type: [PublicOrderEntity], description: 'Matching orders, newest first' })
  data!: PublicOrderEntity[];
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
  CreatedOrderEntity,
  OrderItemEntity,
  OrderGuestData,
  StorefrontPaginationMeta,
  OrderResponseEnvelope,
  OrderListResponseEnvelope,
  PublicOrderEntity,
  PublicOrderItemEntity,
  PublicOrderDeliveryEntity,
  PublicOrderLookupResponseEnvelope,
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
  // Guest checkout: no account stands between a script and this route, and each
  // call reserves stock and sends mail. Without a counter we would rather not
  // take the order than take ten thousand of them (TASK-401).
  @FailClosedThrottle()
  @ApiOperation({ summary: 'Create order from cart', operationId: 'createOrder' })
  @ApiResponse({
    status: 201,
    description:
      'Order created. For a guest order `data.guestAccessToken` carries the order access token ' +
      '(TASK-679); it is absent for an account order.',
    schema: {
      allOf: [
        { $ref: getSchemaPath(OrderResponseEnvelope) },
        { properties: { data: { $ref: getSchemaPath(CreatedOrderEntity) } } },
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
  ): Promise<{ data: CreatedOrderEntity }> {
    const { order, guestAccessToken } = await this.orderService.placeOrder(
      toOrderActor(identity, dto),
      dto,
    );
    // The token rides on THIS response only — reads return a plain OrderEntity.
    return { data: guestAccessToken ? Object.assign(order, { guestAccessToken }) : order };
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
   *
   * ── Why a GET is fail-CLOSED here (TASK-606) ──────────────────────────────
   * `@FailClosedThrottle` is normally kept off reads, but this read IS a
   * credential check: the path segment is the secret. With Redis down and the
   * throttle failing open, the route would answer an unlimited stream of
   * guesses — the same oracle `POST /orders/lookup` below refuses to become.
   * A guest who cannot open their order during a Redis blip is the lesser harm.
   */
  @Get('guest/:token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @FailClosedThrottle()
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
   * POST /api/orders/lookup
   *
   * The public "check my order" form: order number + phone (TASK-483).
   *
   * ── Why POST ──────────────────────────────────────────────────────────────
   * The phone number is half the credential, and a GET would put it in the URL —
   * which means the access log, the browser history, the `Referer` header of
   * every asset the result page loads, and any proxy along the way. A body
   * reaches none of those (B-5 §2).
   *
   * ── Why the throttle is fail-CLOSED ───────────────────────────────────────
   * Unauthenticated and, unlike the contact form, it answers a question about
   * somebody else's data. `@Throttle` alone caps it while Redis is up; when
   * Redis is down `@FailClosedThrottle` refuses the request instead of removing
   * the cap. That ordering — a form that stops working rather than one that
   * becomes unlimited — is the lesson TASK-464 paid for.
   *
   * ── Why a SECOND bucket, per order number (TASK-624) ──────────────────────
   * The per-IP cap stops one client; it cannot see a guess spread across a
   * thousand addresses at the same order. `@OrderLookupThrottle` adds a bucket
   * keyed by the normalised number (ten an hour, from everyone combined — the
   * reasoning sits next to the limit in `throttler.config.ts`), and a refusal
   * from it is logged as `order.lookup_throttled` with a keyed fingerprint of the
   * number, never the number. Fail-closed covers it like the per-IP one: both
   * live in the same store.
   *
   * Every failure answers 404, produced in one place — see
   * `OrderService.lookupOrders`.
   */
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  // Same budget as the contact form and the auth routes: five a minute is far
  // more than a customer checking their parcel needs, and far less than a script
  // walking through order numbers can use.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @OrderLookupThrottle()
  @FailClosedThrottle()
  @ApiOperation({ summary: 'Look up an order by number and phone', operationId: 'lookupOrder' })
  @ApiResponse({
    status: 200,
    description:
      'Orders matching the number and phone — a list, because an 8-character number can ' +
      'collide and every match belongs to the same person',
    type: PublicOrderLookupResponseEnvelope,
  })
  @ApiResponse({
    status: 404,
    description:
      'No order matches (unknown number, wrong phone, malformed input or deleted order — ' +
      'deliberately indistinguishable)',
  })
  @ApiResponse({ status: 429, description: 'Too many requests — rate limit exceeded' })
  async lookupOrder(@Body() dto: OrderLookupDto): Promise<{ data: PublicOrderEntity[] }> {
    const orders = await this.orderService.lookupOrders(dto);
    return { data: orders };
  }

  /**
   * GET /api/orders
   *
   * List the authenticated user's orders (paginated, newest first).
   *
   * `JwtAuthGuard` alone on this and the two customer routes below — the
   * authorisation is ownership (`userId` is taken from the token and passed to
   * the service), never a role. They carried `RolesGuard` as well until
   * TASK-475, with no `@Roles` metadata anywhere on the class or the handlers,
   * which made it return true for every authenticated caller. Dropping it
   * therefore changes who can reach them: nobody.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List current user orders', operationId: 'getOrders' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: OrderStatus,
    isArray: true,
    description:
      'Filter by one or more order statuses — repeated params (`status=PENDING&status=SHIPPED`) ' +
      'or one comma-separated value (`status=PENDING,SHIPPED`); absent means all statuses ' +
      '(TASK-217).',
  })
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
    const page = await this.orderService.getOrders(userId, query);
    return { data: page.items, meta: page.meta };
  }

  /**
   * GET /api/orders/:orderId
   *
   * Get a single order owned by the authenticated user.
   */
  @Get(':orderId')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
