import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../auth';
import { PermissionGuard, RequirePermission } from '../../auth/permissions';
import { ReturnService } from './return.service';
import { ReturnEntity, ReturnItemEntity } from './entities';
import { CreateReturnDto, ResolveReturnDto, ReturnListQueryDto } from './dto';

class AdminReturnPaginationMeta {
  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  limit!: number;

  @ApiProperty({ example: 5 })
  totalPages!: number;
}

class AdminReturnListResponse {
  @ApiProperty({ type: [ReturnEntity] })
  data!: ReturnEntity[];

  @ApiProperty({ type: AdminReturnPaginationMeta })
  meta!: AdminReturnPaginationMeta;
}

class AdminReturnResponseEnvelope {
  @ApiProperty({ type: ReturnEntity })
  data!: ReturnEntity;
}

/**
 * Admin return (RMA) management (TASK-340).
 *
 * Admin endpoints (ADMIN role required):
 *   GET   /admin/returns             — The returns queue
 *   GET   /admin/returns/:returnId   — One return in full
 *   PATCH /admin/returns/:returnId   — Record the operator's decision
 */
@ApiTags('Admin Returns')
@ApiExtraModels(
  ReturnEntity,
  ReturnItemEntity,
  AdminReturnListResponse,
  AdminReturnPaginationMeta,
  AdminReturnResponseEnvelope,
)
@Controller('admin/returns')
@UseGuards(PermissionGuard)
@RequirePermission('returns:read')
export class AdminReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List return requests (admin)',
    operationId: 'adminReturnControllerFindAll',
  })
  @ApiResponse({ status: 200, description: 'Paginated returns', type: AdminReturnListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAll(@Query() query: ReturnListQueryDto): Promise<AdminReturnListResponse> {
    return this.returnService.adminGetReturns(query);
  }

  @Get(':returnId')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get a return by ID (admin)',
    operationId: 'adminReturnControllerFindById',
  })
  @ApiParam({ name: 'returnId', description: 'Return UUID' })
  @ApiResponse({ status: 200, description: 'Return found', type: AdminReturnResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Return not found' })
  async findById(@Param('returnId') returnId: string): Promise<AdminReturnResponseEnvelope> {
    const data = await this.returnService.adminGetReturn(returnId);
    return { data };
  }

  /**
   * PATCH /api/admin/returns/:returnId
   *
   * Record the operator's decision, optionally crediting the returned units back
   * to sellable stock. `restock` is explicit rather than inferred from the status
   * because "the parcel arrived" and "the contents are sellable again" are
   * different claims, and only the operator can see which one is true.
   */
  @Patch(':returnId')
  // Resolving a return moves stock and money — a write, not the class-level read.
  @RequirePermission('returns:write')
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Resolve a return (admin)',
    operationId: 'adminReturnControllerResolve',
  })
  @ApiParam({ name: 'returnId', description: 'Return UUID' })
  @ApiResponse({ status: 200, description: 'Return resolved', type: AdminReturnResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Restock requested for the wrong status' })
  @ApiResponse({ status: 404, description: 'Return not found' })
  @ApiResponse({
    status: 409,
    description: 'Illegal transition, or the goods were already credited back to inventory',
  })
  async resolve(
    @Param('returnId') returnId: string,
    @Body() dto: ResolveReturnDto,
  ): Promise<AdminReturnResponseEnvelope> {
    const data = await this.returnService.resolveReturn(returnId, dto);
    return { data };
  }
}

/**
 * Opening a return FOR a customer (TASK-469, plan 180 / decision B-1.2).
 *
 * A separate controller, not another method on the queue above, because the path
 * is different: a return opened here is opened AGAINST AN ORDER, so it hangs off
 * `/admin/orders/:orderId/returns` — the exact admin mirror of the customer's
 * `POST /orders/:orderId/returns`.
 *
 * WHY IT EXISTS. `Return` is the source of truth about a return: it carries the
 * lines, the quantities, the reason, and it is what credits stock back on
 * RECEIVED. `OrderStatus.REFUNDED` is a derived label — "money went back on this
 * order" — not the record itself. But the only door that could create the record
 * takes `@CurrentUser('id')` and is scoped to the caller's own orders, and a guest
 * (TASK-338) or a phone customer (TASK-341) has no account at all. For those
 * orders the record was unreachable and the operator's only move was the label —
 * precisely the empty-REFUNDED hole returns were built to close (edge case E-12).
 *
 * It lives in this file rather than in `admin-order.controller.ts` on purpose:
 * the behaviour is a return in every respect but its URL, and every rule it has
 * to obey lives in `ReturnService`.
 */
@ApiTags('Admin Returns')
@ApiExtraModels(
  ReturnEntity,
  ReturnItemEntity,
  AdminReturnResponseEnvelope,
  AdminReturnListResponse,
)
@Controller('admin/orders/:orderId/returns')
@UseGuards(PermissionGuard)
@RequirePermission('returns:read')
export class AdminOrderReturnController {
  constructor(private readonly returnService: ReturnService) {}

  /**
   * GET /api/admin/orders/:orderId/returns
   *
   * Every return already opened against this order. The status control asks this
   * before offering to create one — "there is no return on this order yet" is not
   * a question the customer-facing twin can answer for an operator, since it is
   * scoped to the caller's own orders and a guest order has no caller.
   */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List the returns opened against one order (admin)',
    operationId: 'adminOrderReturnControllerFindForOrder',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: 'Returns for the order', type: AdminReturnListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — returns:read required' })
  async findForOrder(@Param('orderId') orderId: string): Promise<{ data: ReturnEntity[] }> {
    const data = await this.returnService.adminGetOrderReturns(orderId);
    return { data };
  }

  /**
   * POST /api/admin/orders/:orderId/returns
   *
   * Open a return on the customer's behalf. `returns:write`, not the class-level
   * read: this one creates a claim on stock and on money.
   *
   * The operator is recorded as `createdByUserId`. Every other rule — the order
   * must have shipped, the lines must belong to it, the units must not exceed
   * what was bought — is the customer path's, unchanged: acting for someone is
   * not permission to return four of three.
   */
  @Post()
  @RequirePermission('returns:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Open a return on the customer behalf (admin)',
    operationId: 'adminOrderReturnControllerCreate',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 201, description: 'Return opened', type: AdminReturnResponseEnvelope })
  @ApiResponse({
    status: 400,
    description: 'Order has not shipped, unknown line, or more units than were bought',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — returns:write required' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async create(
    @CurrentUser('id') actorUserId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CreateReturnDto,
  ): Promise<AdminReturnResponseEnvelope> {
    const data = await this.returnService.adminCreateReturn(actorUserId, orderId, dto);
    return { data };
  }
}
