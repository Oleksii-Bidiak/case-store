import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { OwnershipTransferEntity, StaffPermissionsEntity, StaffUserEntity } from './entities';
import {
  CreateStaffDto,
  SetStaffPasswordDto,
  StaffListQueryDto,
  TransferOwnershipDto,
  UpdateStaffPermissionsDto,
  UpdateStaffRoleDto,
  UpdateStaffStatusDto,
} from './dto';
import { CurrentActor, OwnerOnly, PermissionGuard, RequirePermission } from '../auth/permissions';
import type { PermissionActor } from '../auth/permissions';
import { AuditService, RecordsOwnAudit } from '../audit';

class StaffResponseEnvelope {
  @ApiProperty({ type: StaffUserEntity })
  data!: StaffUserEntity;
}

class StaffPermissionsResponseEnvelope {
  @ApiProperty({ type: StaffPermissionsEntity })
  data!: StaffPermissionsEntity;
}

class OwnershipTransferResponseEnvelope {
  @ApiProperty({ type: OwnershipTransferEntity })
  data!: OwnershipTransferEntity;
}

class StaffPaginationMeta {
  @ApiProperty({ example: 4 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 1 }) totalPages!: number;
}

class StaffListResponseEnvelope {
  @ApiProperty({ type: [StaffUserEntity] }) data!: StaffUserEntity[];
  @ApiProperty({ type: StaffPaginationMeta }) meta!: StaffPaginationMeta;
}

/**
 * «Персонал» — service accounts and who may manage them (TASK-476, plan 181,
 * decision 3).
 *
 * WHY THIS IS ITS OWN SECTION RATHER THAN A TAB ON `/users`. On the live run of
 * 2026-08-27 the owner could not find how to create a manager: the account was
 * made on `/users`, the rights were granted on `/settings/permissions`, and the
 * rights went to a ROLE rather than to the person. But the split is not only
 * ergonomics. While staff lived on the customer list they were governed by
 * customer permissions — `customers:read` listed every service account and
 * `customers:write` could switch one off — so an operator hired to phone
 * customers could deactivate an administrator. Staff now sit behind
 * `staff:read` / `staff:write`, which are NON-GRANTABLE by construction
 * (`permission.catalog.ts`): an owner and a deputy admin hold them by level, and
 * there is no screen on which they can be ticked for anybody else.
 *
 * TWO CHECKS GUARD EVERY WRITE HERE, AND THEY ANSWER DIFFERENT QUESTIONS. The
 * guard answers "may this caller use this surface at all" (`staff:write`); the
 * service answers "may they do it to THIS person" (`assertMayManage`) and "may
 * they hand out THAT level" (`assertMayAssign`). The second pair cannot live in a
 * decorator, because the target is only known once the row is read — which is
 * exactly why they are in the service and not here.
 *
 * SINCE TASK-477 THE PERMISSION PAIR LIVES HERE TOO — `GET`/`PUT
 * :id/permissions`. On the same controller rather than in the template module
 * because an owner asking "what may Olena do?" is asking a question about a
 * PERSON, and the answer belongs beside her account; templates are a separate
 * surface (`/api/admin/permission-templates`) because they are about nobody in
 * particular. Note the asymmetric keys: reading is `staff:read` (a deputy may see
 * that an admin holds no rows and learn nothing from it), writing is
 * `staff:write` PLUS the level rule, applied in the service where the target is
 * known.
 *
 * AND SINCE TASK-478, THE TRANSFER — `POST :id/transfer-ownership`. It is the one
 * route here that is `@OwnerOnly()` rather than `staff:write`, and the one that
 * asks for a password. Note what that combination refuses: a deputy admin, who
 * passes every `@RequirePermission` in the catalogue, is refused by the guard
 * before the body is ever read, because `PermissionGuard` consults `@OwnerOnly`
 * BEFORE the admin bypass. It is also the only route in the system that can move
 * `isOwner` at all — `assertMayManage` makes the owner's account unreachable
 * through every other door, deliberately, and without this one an owner who leaves
 * would be a dead end.
 */
@ApiTags('Staff')
@ApiExtraModels(
  StaffUserEntity,
  StaffResponseEnvelope,
  StaffListResponseEnvelope,
  StaffPermissionsEntity,
  StaffPermissionsResponseEnvelope,
  OwnershipTransferEntity,
  OwnershipTransferResponseEnvelope,
)
@Controller('admin/staff')
@UseGuards(PermissionGuard)
@RequirePermission('staff:read')
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
    // Only for the permission write, which records its own entry with a
    // before-image. Every other route on this controller is covered by the
    // generic `AuditInterceptor`.
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /api/admin/staff
   *
   * Service accounts only (ADMIN + MANAGER), paginated and searchable in the same
   * shape `/api/users` uses. Each row carries its level, how many permissions the
   * person holds and when they last had a live session.
   */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List staff accounts', operationId: 'listStaff' })
  @ApiResponse({ status: 200, description: 'Paginated staff', type: StaffListResponseEnvelope })
  @ApiResponse({ status: 403, description: 'Forbidden — requires staff:read' })
  findAll(@Query() query: StaffListQueryDto) {
    return this.staffService.findAll(query);
  }

  /**
   * POST /api/admin/staff
   *
   * Creates a service account. An admin may create a MANAGER; only the owner may
   * create an ADMIN — nobody assigns their own level or above.
   */
  @Post()
  @RequirePermission('staff:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a staff account', operationId: 'createStaff' })
  @ApiResponse({ status: 201, description: 'Staff account created', type: StaffResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input (weak password / bad role)' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — requires staff:write, or the level is at or above your own',
  })
  @ApiResponse({ status: 409, description: 'Email is already taken' })
  async create(
    @Body() dto: CreateStaffDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<{ data: StaffUserEntity }> {
    return { data: await this.staffService.create(dto, actor) };
  }

  /**
   * GET /api/admin/staff/:id
   *
   * 404 for a customer id: this surface is about service accounts, and answering
   * differently would make `staff:read` a way to probe for shoppers.
   */
  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a staff account', operationId: 'getStaff' })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({ status: 200, description: 'Staff account', type: StaffResponseEnvelope })
  @ApiResponse({ status: 403, description: 'Forbidden — requires staff:read' })
  @ApiResponse({ status: 404, description: 'No staff account with this id' })
  async findById(@Param('id') id: string): Promise<{ data: StaffUserEntity }> {
    return { data: await this.staffService.findById(id) };
  }

  /**
   * PATCH /api/admin/staff/:id/role
   *
   * The one route on this controller that accepts a CUSTOMER target: promoting an
   * existing shopper is how most managers are hired. Demoting is how they leave —
   * safer than deletion, because their order history stays on a live row.
   */
  @Patch(':id/role')
  @RequirePermission('staff:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Change an account's role", operationId: 'updateStaffRole' })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({
    status: 200,
    description: 'Role updated; target sessions revoked',
    type: StaffResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid role' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — your own account, a level at or above your own, or the shop owner',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateStaffRoleDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<{ data: StaffUserEntity }> {
    return { data: await this.staffService.updateRole(id, dto.role, actor) };
  }

  /**
   * POST /api/admin/staff/:id/password
   *
   * The employee-forgot-their-password path. Revokes every session the target
   * held, exactly as a self-service change does — resetting a password because an
   * account may be compromised must not leave the intruder signed in.
   */
  @Post(':id/password')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('staff:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: "Reset a staff member's password", operationId: 'setStaffPassword' })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({
    status: 200,
    description: 'Password reset; target sessions revoked',
    type: StaffResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid input (weak password)' })
  @ApiResponse({ status: 403, description: 'Forbidden — the target is at or above your level' })
  @ApiResponse({ status: 404, description: 'No staff account with this id' })
  async setPassword(
    @Param('id') id: string,
    @Body() dto: SetStaffPasswordDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<{ data: StaffUserEntity }> {
    return { data: await this.staffService.setPassword(id, dto.newPassword, actor) };
  }

  /**
   * PATCH /api/admin/staff/:id/status
   *
   * Activate or deactivate. One route for both directions so the level check
   * cannot be present on one and missing on the other — which is how deactivation
   * ended up under `customers:write` in the first place.
   */
  @Patch(':id/status')
  @RequirePermission('staff:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Activate or deactivate a staff account',
    operationId: 'updateStaffStatus',
  })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({ status: 200, description: 'Status updated', type: StaffResponseEnvelope })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — your own account, or a target at or above your level',
  })
  @ApiResponse({ status: 404, description: 'No staff account with this id' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStaffStatusDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<{ data: StaffUserEntity }> {
    return { data: await this.staffService.setStatus(id, dto.isActive, actor) };
  }

  /**
   * DELETE /api/admin/staff/:id
   *
   * Soft delete: `deletedAt` stamped, email mangled so the address can be used
   * again, sessions revoked, row kept so history still resolves.
   */
  @Delete(':id')
  @RequirePermission('staff:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a staff account (soft delete)', operationId: 'deleteStaff' })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({ status: 204, description: 'Staff account deleted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — your own account, or a target at or above your level',
  })
  @ApiResponse({ status: 404, description: 'No staff account with this id' })
  async remove(@Param('id') id: string, @CurrentActor() actor: PermissionActor): Promise<void> {
    await this.staffService.remove(id, actor);
  }

  /**
   * GET /api/admin/staff/:id/permissions
   *
   * What this person holds, plus the whole GRANTABLE catalogue with its zone
   * headings — one call, because the screen needs both and a separate catalogue
   * endpoint is a second thing to keep in step. Non-grantable keys are absent
   * from the catalogue by construction, so no UI can render a box that must not
   * be ticked.
   */
  @Get(':id/permissions')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "Read a staff member's permissions and the grantable catalogue",
    operationId: 'getStaffPermissions',
  })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({
    status: 200,
    description: 'Granted keys + catalogue',
    type: StaffPermissionsResponseEnvelope,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — requires staff:read' })
  @ApiResponse({ status: 404, description: 'No staff account with this id' })
  async getPermissions(@Param('id') id: string): Promise<{ data: StaffPermissionsEntity }> {
    return { data: await this.staffService.getPermissions(id) };
  }

  /**
   * PUT /api/admin/staff/:id/permissions
   *
   * Replace the whole set. PUT rather than PATCH because the body IS the complete
   * state the owner's checkbox grid displays — an unticked box is a revocation,
   * and submitting the same grid twice cannot mean anything different.
   *
   * `@RecordsOwnAudit()` + the explicit `record()` below are one decision, not
   * two. The generic interceptor would log the SUBMITTED list and nothing else,
   * and the question this screen exists to answer afterwards — «хто тихо видав
   * менеджеру доступ до замовлень?» — needs the state before the write, which no
   * interceptor can have. `StaffService.setPermissions` reads it inside the same
   * operation and hands it back; the mark stops the poorer duplicate row.
   *
   * The permission takes effect on the target's very next request (invariant 8):
   * `PermissionGuard` re-reads their rows every time and nothing caches them.
   */
  @Put(':id/permissions')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('staff:write')
  @RecordsOwnAudit()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "Replace a staff member's permissions",
    operationId: 'updateStaffPermissions',
  })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({
    status: 200,
    description: 'Permissions replaced',
    type: StaffPermissionsResponseEnvelope,
  })
  @ApiResponse({
    status: 400,
    description: 'Unknown permission key, or one that is never granted to a person',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — the target is at or above your level' })
  @ApiResponse({ status: 404, description: 'No staff account with this id' })
  async updatePermissions(
    @Param('id') id: string,
    @Body() dto: UpdateStaffPermissionsDto,
    @CurrentActor() actor: PermissionActor,
    @Req() request: Request,
  ): Promise<{ data: StaffPermissionsEntity }> {
    const change = await this.staffService.setPermissions(id, dto.permissions, actor);

    await this.auditService.record({
      actorId: actor.id,
      // Taken from the guard's database read, like the interceptor does, so the
      // row records who the caller REALLY was rather than what a 15-minute-old
      // token claimed.
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'staff.updatePermissions',
      entityType: 'staff',
      entityId: change.target.id,
      summary: `Права ${change.target.email}: ${change.after.length} дозволів (було ${change.before.length})`,
      diff: { permissions: { from: [...change.before].sort(), to: [...change.after].sort() } },
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return { data: change.entity };
  }

  /**
   * POST /api/admin/staff/:id/transfer-ownership
   *
   * Hand the shop to another administrator. `@OwnerOnly()` rather than a
   * permission key: everything else in the reserve is "an admin may not", but this
   * one is "only the owner, ever", and a key that appears on no granting screen is
   * still a key somebody could add to one.
   *
   * THE BODY CARRIES THE CALLER'S OWN PASSWORD. A valid token proves a session was
   * opened recently; it does not prove the owner is at the keyboard now. This is
   * the one act that cannot be undone by signing back in — afterwards the caller
   * is a deputy and the recipient holds the reserve — so it re-authenticates. A
   * wrong password answers 401 with the same generic message login uses.
   *
   * ONE NOTE FOR THE UI (TASK-480): because that 401 comes from a route outside
   * `/auth/`, the admin client's response interceptor will refresh once and replay
   * the request before surfacing the error. Harmless — a wrong password writes
   * nothing, which `staff.e2e-spec.ts` asserts explicitly — but a screen here
   * should not treat the first 401 as "your session expired".
   *
   * `@RecordsOwnAudit()` for two reasons, and the second is not optional. The
   * generic interceptor logs the REQUEST BODY as the diff, and this body is the
   * owner's password: `sanitizeForAudit` would redact the field by name, but
   * relying on a substring match to keep a plaintext password out of the audit
   * table is not a thing to rely on twice. It also could not name the OUTGOING
   * owner, who is the more interesting half of "who handed the shop to whom".
   */
  @Post(':id/transfer-ownership')
  @HttpCode(HttpStatus.OK)
  @OwnerOnly()
  @RecordsOwnAudit()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Transfer shop ownership to another administrator',
    operationId: 'transferStaffOwnership',
  })
  @ApiParam({ name: 'id', description: 'UUID of the administrator receiving the shop' })
  @ApiResponse({
    status: 200,
    description: 'Ownership transferred; both parties’ sessions revoked',
    type: OwnershipTransferResponseEnvelope,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing password, yourself, a manager, or a deactivated account',
  })
  @ApiResponse({ status: 401, description: 'The password did not match' })
  @ApiResponse({ status: 403, description: 'Forbidden — only the shop owner may transfer' })
  @ApiResponse({ status: 404, description: 'No staff account with this id' })
  async transferOwnership(
    @Param('id') id: string,
    @Body() dto: TransferOwnershipDto,
    @CurrentActor() actor: PermissionActor,
    @Req() request: Request,
  ): Promise<{ data: OwnershipTransferEntity }> {
    const transfer = await this.staffService.transferOwnership(id, dto.password, actor);

    await this.auditService.record({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'staff.transferOwnership',
      entityType: 'staff',
      // The account that RECEIVED the shop: the row an operator scrolling the log
      // would click on to ask "who is this person?".
      entityId: transfer.owner.id,
      summary: `Власність магазину передано: ${transfer.previousOwner.email} → ${transfer.owner.email}`,
      diff: { isOwner: { from: transfer.previousOwner.email, to: transfer.owner.email } },
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    return { data: OwnershipTransferEntity.fromParts(transfer.owner, transfer.previousOwner) };
  }
}
