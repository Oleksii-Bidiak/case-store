import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
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
import { PermissionGuard, RequirePermission } from '../../auth/permissions';
import { ReturnService } from './return.service';
import { ReturnEntity, ReturnItemEntity } from './entities';
import { ResolveReturnDto, ReturnListQueryDto } from './dto';

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
