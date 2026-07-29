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
import { OwnerOnly } from '../auth/permissions/require-permission.decorator';

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
 * `@OwnerOnly()`, not a grantable permission. The log denormalises actor emails
 * and carries diffs of customer-facing records, so it is both a PII surface and
 * the record of what staff did — a manager who could read it could check whether
 * their own actions had been noticed. There is deliberately no delete or edit
 * route: an append-only log that an actor can prune is not a log.
 */
@ApiTags('Audit')
@ApiExtraModels(AuditLogEntity, AuditLogListResponseEnvelope)
@Controller('admin/audit-log')
@UseGuards(PermissionGuard)
@OwnerOnly()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /api/admin/audit-log
   *
   * Newest first, paginated, filterable by actor / action / entity / time range
   * and sortable by time, actor or action.
   */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Read the admin action log (owner-only)', operationId: 'getAuditLog' })
  @ApiResponse({
    status: 200,
    description: 'Paginated log entries',
    type: AuditLogListResponseEnvelope,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — owner-only' })
  async findAll(@Query() query: AuditLogQueryDto): Promise<{
    data: AuditLogEntity[];
    meta: AuditLogPaginationMeta;
  }> {
    return this.auditService.findMany({
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      actorId: query.actorId,
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
