import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PermissionService } from './permission.service';
import { PermissionGuard } from './permission.guard';
import { OwnerOnly } from './require-permission.decorator';
import { UpdateRoleGrantsDto } from './dto';
import { CurrentUser } from '../decorators';
import { AuditService } from '../../audit/audit.service';

/** One permission as the matrix screen renders it. */
class PermissionCatalogueEntry {
  @ApiProperty({ example: 'orders:read' }) key!: string;
  @ApiProperty({ example: 'orders' }) zone!: string;
  @ApiProperty({ example: 'Переглядати замовлення' }) label!: string;
}

/** A zone heading, in display order. */
class PermissionZoneEntry {
  @ApiProperty({ example: 'orders' }) zone!: string;
  @ApiProperty({ example: 'Замовлення' }) label!: string;
}

/** One role's current grants. */
class RoleGrantsEntry {
  @ApiProperty({ enum: UserRole, example: UserRole.MANAGER }) role!: UserRole;
  @ApiProperty({ type: [String], example: ['orders:read'] }) permissions!: string[];
}

class PermissionMatrixEntity {
  @ApiProperty({ type: [PermissionCatalogueEntry] }) catalogue!: PermissionCatalogueEntry[];
  @ApiProperty({ type: [PermissionZoneEntry] }) zones!: PermissionZoneEntry[];
  @ApiProperty({ enum: UserRole, isArray: true }) grantableRoles!: UserRole[];
  @ApiProperty({ type: [RoleGrantsEntry] }) grants!: RoleGrantsEntry[];
}

class PermissionMatrixResponseEnvelope {
  @ApiProperty({ type: PermissionMatrixEntity }) data!: PermissionMatrixEntity;
}

class RoleGrantsResponseEnvelope {
  @ApiProperty({ type: RoleGrantsEntry }) data!: RoleGrantsEntry;
}

/**
 * The owner's permission-matrix screen (TASK-334).
 *
 * `@OwnerOnly()` at class level, never `@RequirePermission`: a `permissions:write`
 * permission would be a permission to grant yourself every other permission,
 * which makes the entire matrix decorative. The same reasoning keeps user
 * management out of the catalogue — see `permission.catalog.ts`.
 */
@ApiTags('Permissions')
@ApiExtraModels(
  PermissionMatrixEntity,
  PermissionMatrixResponseEnvelope,
  RoleGrantsResponseEnvelope,
)
@Controller('admin/permissions')
@UseGuards(PermissionGuard)
@OwnerOnly()
export class PermissionController {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /api/admin/permissions
   *
   * The code catalogue (every permission that exists, with its zone) plus the
   * current grants. Returned together so the screen never has to guess which
   * permissions exist — a new admin section appears in the matrix simply by
   * being declared in `permission.catalog.ts`.
   */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Read the permission catalogue and the current matrix (owner-only)' })
  @ApiResponse({
    status: 200,
    description: 'Catalogue + grants',
    type: PermissionMatrixResponseEnvelope,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — owner-only' })
  async getMatrix(): Promise<{ data: Awaited<ReturnType<PermissionService['getMatrix']>> }> {
    return { data: await this.permissionService.getMatrix() };
  }

  /**
   * PUT /api/admin/permissions
   *
   * Replace one role's entire grant set. The cache is evicted as part of the
   * write, so a permission revoked here is refused on the target's very next
   * request rather than up to a TTL later.
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Replace one role’s permission grants (owner-only)' })
  @ApiResponse({ status: 200, description: 'Grants replaced', type: RoleGrantsResponseEnvelope })
  @ApiResponse({
    status: 400,
    description: 'Unknown permission key, or a role the matrix cannot express (ADMIN)',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — owner-only' })
  async updateGrants(
    @Body() dto: UpdateRoleGrantsDto,
    @CurrentUser('id') actorId: string,
  ): Promise<{ data: { role: UserRole; permissions: string[] } }> {
    const before = await this.permissionService.getRoleGrants(dto.role).catch(() => []);
    const permissions = await this.permissionService.setRoleGrants(dto.role, dto.permissions);

    // Written explicitly rather than left to AuditInterceptor: this is the one
    // mutation where the BEFORE state is the interesting half ("who quietly gave
    // the manager access to orders?"), and a generic interceptor has no
    // pre-image to record.
    await this.auditService.record({
      actorId,
      action: 'permissions.update',
      entityType: 'RolePermission',
      entityId: dto.role,
      summary: `Права ролі ${dto.role}: ${permissions.length} дозволів`,
      diff: { permissions: { from: [...before].sort(), to: [...permissions].sort() } },
    });

    return { data: { role: dto.role, permissions } };
  }
}
