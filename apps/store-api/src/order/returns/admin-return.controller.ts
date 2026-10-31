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
import {
  CurrentActor,
  PermissionGuard,
  RequirePermission,
  type PermissionActor,
} from '../../auth/permissions';
import { ReturnService } from './return.service';
import {
  ReturnActorEntity,
  ReturnDecisionEventEntity,
  ReturnEntity,
  ReturnItemEntity,
  ReturnRepairStepEntity,
} from './entities';
import {
  AddRepairStepDto,
  CreateReturnDto,
  DecideReturnDto,
  ResolveReturnDto,
  ReturnListQueryDto,
} from './dto';

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
 *   PATCH /admin/returns/:returnId   — Move the goods and the money on
 *   POST  /admin/returns/:returnId/decision     — The operator's decision
 *   POST  /admin/returns/:returnId/repair-steps — One step of a repair (TASK-2045)
 */
@ApiTags('Admin Returns')
@ApiExtraModels(
  ReturnEntity,
  ReturnItemEntity,
  ReturnActorEntity,
  ReturnDecisionEventEntity,
  ReturnRepairStepEntity,
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
    const page = await this.returnService.adminGetReturns(query);
    return { data: page.items, meta: page.meta };
  }

  @Get(':returnId')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get a return by ID (admin)',
    operationId: 'adminReturnControllerFindById',
  })
  @ApiParam({ name: 'returnId', description: 'Return UUID' })
  @ApiResponse({ status: 200, description: 'Return found', type: AdminReturnResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Return not found — error: RETURN_NOT_FOUND' })
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
    summary: 'Resolve a return, or save its operator notes (admin)',
    description:
      'With a status: a guarded transition (RECEIVED or REFUNDED), optionally with notes, ' +
      'refundedAmount and restock. Without a status: saves operatorNotes alone on a return of ' +
      'any status — no transition, resolvedAt and the decision untouched.',
    operationId: 'adminReturnControllerResolve',
  })
  @ApiParam({ name: 'returnId', description: 'Return UUID' })
  @ApiResponse({ status: 200, description: 'Return resolved', type: AdminReturnResponseEnvelope })
  @ApiResponse({
    status: 400,
    description:
      'error: RETURN_UPDATE_EMPTY (neither a status nor operatorNotes), ' +
      'RETURN_STATUS_REQUIRED (refundedAmount or restock without a status), ' +
      'RETURN_USE_DECISION_ENDPOINT (APPROVED and REJECTED are set only by a decision), ' +
      'RETURN_RESTOCK_REQUIRES_RECEIVED (restock requested for a status other than ' +
      'RECEIVED), RETURN_REFUND_EXCEEDS_RETURNED_VALUE or RETURN_REFUND_EXCEEDS_ORDER_BALANCE',
  })
  @ApiResponse({ status: 404, description: 'Return not found — error: RETURN_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description:
      'error: RETURN_TRANSITION_INVALID (illegal transition, or REFUNDED without a REFUND ' +
      'decision) or RETURN_ALREADY_RESTOCKED (the goods were already credited back to inventory)',
  })
  async resolve(
    @Param('returnId') returnId: string,
    @Body() dto: ResolveReturnDto,
  ): Promise<AdminReturnResponseEnvelope> {
    const data = await this.returnService.resolveReturn(returnId, dto);
    return { data };
  }

  /**
   * POST /api/admin/returns/:returnId/decision
   *
   * The operator's decision (TASK-1961, TASK-2044): refund, replacement, repair
   * or refusal, with a reason the customer sees. Approving and refusing happen
   * ONLY here — PATCH refuses those statuses — so a refusal without a reason, or
   * a silent change of an earlier decision, cannot be made through the API.
   *
   * The author is the actor the permission guard resolved from the database,
   * not the token's claims. The audit row is `return.decide`.
   */
  @Post(':returnId/decision')
  @RequirePermission('returns:write')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Decide on a return (admin)',
    description:
      'REFUND, REPLACEMENT and REPAIR approve the return (or re-open a refused one, re-claiming ' +
      'its units); REJECT refuses it. A reason is required on REJECT and on any change of a ' +
      'decision already made. Every decision is recorded with its author in the return history.',
    operationId: 'adminReturnControllerDecide',
  })
  @ApiParam({ name: 'returnId', description: 'Return UUID' })
  @ApiResponse({ status: 200, description: 'Decision recorded', type: AdminReturnResponseEnvelope })
  @ApiResponse({
    status: 400,
    description:
      'error: RETURN_DECISION_REASON_REQUIRED (refusal or change without a reason), or a ' +
      'validation error (unknown decision, reason over 1000 characters)',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — returns:write required' })
  @ApiResponse({ status: 404, description: 'Return not found — error: RETURN_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description:
      'error: RETURN_DECISION_LOCKED (the return was refunded), RETURN_DECISION_UNCHANGED ' +
      '(same decision and reason), RETURN_TRANSITION_INVALID (refusing goods already ' +
      'received, or the return changed meanwhile) or RETURN_QUANTITY_EXCEEDED (re-opening a ' +
      'refusal whose units a newer request now holds; the message names the remainder)',
  })
  async decide(
    @CurrentActor() actor: PermissionActor,
    @Param('returnId') returnId: string,
    @Body() dto: DecideReturnDto,
  ): Promise<AdminReturnResponseEnvelope> {
    const data = await this.returnService.decideReturn(returnId, actor.id, dto);
    return { data };
  }

  /**
   * POST /api/admin/returns/:returnId/repair-steps
   *
   * One step of a repair (TASK-2045): accepted from the customer → sent to the
   * service → back from it (with the outcome) → handed to the customer. Only on
   * a return decided as REPAIR, strictly in order, each step once. The author is
   * the actor the permission guard resolved; the audit row is
   * `return.addRepairStep`.
   */
  @Post(':returnId/repair-steps')
  @RequirePermission('returns:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Record a repair step (admin)',
    description:
      'Steps go strictly in order — ACCEPTED → SENT_TO_SERVICE → RETURNED_FROM_SERVICE → ' +
      'HANDED_TO_CUSTOMER — none skipped or repeated, and only while the decision is REPAIR. ' +
      'RETURNED_FROM_SERVICE requires a result; no other step takes one. UNREPAIRABLE does not ' +
      'change the decision: change it through POST /admin/returns/:returnId/decision, with a ' +
      'reason. Answers with the return card, repair steps included.',
    operationId: 'adminReturnControllerAddRepairStep',
  })
  @ApiParam({ name: 'returnId', description: 'Return UUID' })
  @ApiResponse({
    status: 201,
    description: 'Repair step recorded',
    type: AdminReturnResponseEnvelope,
  })
  @ApiResponse({
    status: 400,
    description:
      'error: RETURN_REPAIR_RESULT_REQUIRED (RETURNED_FROM_SERVICE without a result), ' +
      'RETURN_REPAIR_RESULT_NOT_ALLOWED (a result on any other step), or a validation error ' +
      '(unknown step or result, destination over 300, ttn over 64, note over 2000 characters)',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — returns:write required' })
  @ApiResponse({ status: 404, description: 'Return not found — error: RETURN_NOT_FOUND' })
  @ApiResponse({
    status: 409,
    description:
      'error: RETURN_REPAIR_STEP_INVALID (the return is not an open REPAIR, the step is out of ' +
      'order or the repair is complete — the message names the step expected — or the same ' +
      'step was recorded concurrently)',
  })
  async addRepairStep(
    @CurrentActor() actor: PermissionActor,
    @Param('returnId') returnId: string,
    @Body() dto: AddRepairStepDto,
  ): Promise<AdminReturnResponseEnvelope> {
    const data = await this.returnService.addRepairStep(returnId, actor.id, dto);
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
  ReturnActorEntity,
  ReturnDecisionEventEntity,
  ReturnRepairStepEntity,
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
    description:
      'error: RETURN_ORDER_NOT_RETURNABLE (order has not shipped), RETURN_ITEM_NOT_IN_ORDER ' +
      '(unknown line) or RETURN_QUANTITY_EXCEEDED (more units than remain returnable; the ' +
      'message names the remainder)',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — returns:write required' })
  @ApiResponse({ status: 404, description: 'Order not found — error: RETURN_ORDER_NOT_FOUND' })
  async create(
    @CurrentUser('id') actorUserId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CreateReturnDto,
  ): Promise<AdminReturnResponseEnvelope> {
    const data = await this.returnService.adminCreateReturn(actorUserId, orderId, dto);
    return { data };
  }
}
