import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto';
import { AuditLogEntity } from './entities';
import { PermissionGuard } from '../auth/permissions/permission.guard';
import { RequirePermission } from '../auth/permissions/require-permission.decorator';

class AuditLogPaginationMeta {
  @ApiProperty({ example: 240 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 50 }) limit!: number;
  @ApiProperty({ example: 5 }) totalPages!: number;
}

class AuditLogListResponseEnvelope {
  @ApiProperty({ type: [AuditLogEntity] }) data!: AuditLogEntity[];
  @ApiProperty({ type: AuditLogPaginationMeta }) meta!: AuditLogPaginationMeta;
}

/**
 * The action log viewer (TASK-318).
 *
 * `audit:read` — a real permission key that is NEVER OFFERED to anybody
 * (`grantable: false` in the catalogue), so in practice only an owner and an
 * admin hold it. It was `@OwnerOnly()` until TASK-475, and the change is not a
 * relaxation: `@OwnerOnly` now means the single account that owns the shop, and
 * a deputy admin who cannot read the log cannot stand in for the owner at all.
 * What must not happen is the log becoming a tick on a granting screen — it
 * denormalises actor emails, carries diffs of customer-facing records, and is
 * the record of what staff did, so a manager who could read it could check
 * whether their own actions had been noticed. Non-grantable says both things at
 * once.
 *
 * There is deliberately no delete or edit route: an append-only log that an
 * actor can prune is not a log.
 */
@ApiTags('Audit')
@ApiExtraModels(AuditLogEntity, AuditLogListResponseEnvelope)
@Controller('admin/audit-log')
@UseGuards(PermissionGuard)
@RequirePermission('audit:read')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /api/admin/audit-log
   *
   * Newest first, paginated, filterable by actor (id or role) / action / entity /
   * time range and sortable by time, actor or action.
   */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Read the admin action log', operationId: 'getAuditLog' })
  @ApiResponse({
    status: 200,
    description: 'Paginated log entries',
    type: AuditLogListResponseEnvelope,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — requires audit:read' })
  async findAll(@Query() query: AuditLogQueryDto): Promise<{
    data: AuditLogEntity[];
    meta: AuditLogPaginationMeta;
  }> {
    return this.auditService.findMany({
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      actorId: query.actorId,
      actorRole: query.actorRole,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      from: query.from,
      to: query.to,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }
}
