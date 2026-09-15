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
  Req,
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
import type { Request } from 'express';
import { PermissionTemplateService } from './permission-template.service';
import { AppliedTemplateEntity, PermissionTemplateEntity } from './entities';
import {
  ApplyPermissionTemplateDto,
  CreatePermissionTemplateDto,
  UpdatePermissionTemplateDto,
} from './dto';
import { CurrentActor, PermissionGuard, RequirePermission } from '../auth/permissions';
import type { PermissionActor } from '../auth/permissions';
import { AuditService, RecordsOwnAudit } from '../audit';

class PermissionTemplateResponseEnvelope {
  @ApiProperty({ type: PermissionTemplateEntity }) data!: PermissionTemplateEntity;
}

class PermissionTemplateListResponseEnvelope {
  @ApiProperty({ type: [PermissionTemplateEntity] }) data!: PermissionTemplateEntity[];
}

class AppliedTemplateResponseEnvelope {
  @ApiProperty({ type: AppliedTemplateEntity }) data!: AppliedTemplateEntity;
}

/**
 * «Шаблони прав» — reusable sets the owner applies when hiring (TASK-477, plan
 * 181, decision 2 of the 2026-09-11 B-3 session).
 *
 * WHY A SEPARATE CONTROLLER FROM `/admin/staff`. A template is about nobody in
 * particular: it is the SHAPE of a job («Оператор замовлень», «Контент-менеджер»),
 * kept so the next hire does not mean re-deciding thirty checkboxes from memory.
 * A person's permissions are about that person and live beside their account.
 * Sharing a controller would blur exactly the distinction the copy rule depends
 * on.
 *
 * THE KEYS, AND THE ASYMMETRY. Reading is `staff:read`, writing `staff:write` —
 * both non-grantable, so only the owner and a deputy admin reach this surface at
 * all. Only ONE route also consults the level rule: `apply`, because it is the
 * only one that changes what a live person can do. Creating and editing templates
 * changes nobody's access (that is the copy rule), so there is no target to rank
 * the caller against.
 *
 * NO ROUTE HERE CAN HAND OUT A NON-GRANTABLE KEY. `assertGrantablePermissions`
 * runs on every template write and again when a template is applied — otherwise
 * a template would be precisely the back door round `grantable: false`: park
 * `staff:write` in one, apply it, and the recipient can grant themselves the rest
 * of the catalogue.
 */
@ApiTags('Permission templates')
@ApiExtraModels(
  PermissionTemplateEntity,
  AppliedTemplateEntity,
  PermissionTemplateResponseEnvelope,
  PermissionTemplateListResponseEnvelope,
  AppliedTemplateResponseEnvelope,
)
@Controller('admin/permission-templates')
@UseGuards(PermissionGuard)
@RequirePermission('staff:read')
export class PermissionTemplateController {
  constructor(
    private readonly templateService: PermissionTemplateService,
    // Only for `apply`, which records its own entry with a before-image; template
    // CRUD is covered by the generic `AuditInterceptor`.
    private readonly auditService: AuditService,
  ) {}

  /** GET /api/admin/permission-templates */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List permission templates', operationId: 'listPermissionTemplates' })
  @ApiResponse({
    status: 200,
    description: 'Templates, by name',
    type: PermissionTemplateListResponseEnvelope,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — requires staff:read' })
  async findAll(): Promise<{ data: PermissionTemplateEntity[] }> {
    const templates = await this.templateService.findAll();
    return { data: templates.map((template) => PermissionTemplateEntity.fromRecord(template)) };
  }

  /** GET /api/admin/permission-templates/:id */
  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get one permission template', operationId: 'getPermissionTemplate' })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({ status: 200, description: 'Template', type: PermissionTemplateResponseEnvelope })
  @ApiResponse({ status: 403, description: 'Forbidden — requires staff:read' })
  @ApiResponse({ status: 404, description: 'No template with this id' })
  async findById(@Param('id') id: string): Promise<{ data: PermissionTemplateEntity }> {
    return { data: PermissionTemplateEntity.fromRecord(await this.templateService.findById(id)) };
  }

  /** POST /api/admin/permission-templates */
  @Post()
  @RequirePermission('staff:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create a permission template',
    operationId: 'createPermissionTemplate',
  })
  @ApiResponse({
    status: 201,
    description: 'Template created',
    type: PermissionTemplateResponseEnvelope,
  })
  @ApiResponse({
    status: 400,
    description: 'Unknown permission key, or one that is never granted to a person',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — requires staff:write' })
  @ApiResponse({ status: 409, description: 'A template with this name already exists' })
  async create(
    @Body() dto: CreatePermissionTemplateDto,
  ): Promise<{ data: PermissionTemplateEntity }> {
    const created = await this.templateService.create({
      name: dto.name,
      description: dto.description ?? null,
      permissions: dto.permissions,
    });
    return { data: PermissionTemplateEntity.fromRecord(created) };
  }

  /**
   * PATCH /api/admin/permission-templates/:id
   *
   * Changes nobody's access. Worth saying on the route as well as in the service,
   * because it is the most surprising true thing about this module: an owner who
   * widens «Оператор замовлень» has changed what the NEXT person set up from it
   * gets, and nothing else.
   */
  @Patch(':id')
  @RequirePermission('staff:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Edit a permission template (affects nobody already set up from it)',
    operationId: 'updatePermissionTemplate',
  })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({
    status: 200,
    description: 'Template updated',
    type: PermissionTemplateResponseEnvelope,
  })
  @ApiResponse({
    status: 400,
    description: 'Unknown permission key, or one that is never granted to a person',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — requires staff:write' })
  @ApiResponse({ status: 404, description: 'No template with this id' })
  @ApiResponse({ status: 409, description: 'A template with this name already exists' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePermissionTemplateDto,
  ): Promise<{ data: PermissionTemplateEntity }> {
    const updated = await this.templateService.update(id, {
      ...(dto.name === undefined ? {} : { name: dto.name }),
      ...(dto.description === undefined ? {} : { description: dto.description }),
      ...(dto.permissions === undefined ? {} : { permissions: dto.permissions }),
    });
    return { data: PermissionTemplateEntity.fromRecord(updated) };
  }

  /** DELETE /api/admin/permission-templates/:id — safe at any moment. */
  @Delete(':id')
  @RequirePermission('staff:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Delete a permission template',
    operationId: 'deletePermissionTemplate',
  })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({ status: 204, description: 'Template deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires staff:write' })
  @ApiResponse({ status: 404, description: 'No template with this id' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.templateService.remove(id);
  }

  /**
   * POST /api/admin/permission-templates/:id/apply
   *
   * Copy this template onto one person. THE COPY IS THE POINT: after this call
   * the person holds the template's keys as their own rows and nothing records
   * where they came from, so editing the template later cannot move them (plan
   * 178, decision 2; `permission-template.service.ts` has the full argument).
   *
   * The only route on this controller that consults the level rule, because it is
   * the only one that changes what a live person can do — `assertMayManage` runs
   * inside `StaffService.setPermissions`, the single write that grants anybody
   * anything.
   *
   * `@RecordsOwnAudit()` for the same reason as the staff route: the generic
   * interceptor would log the target's id and nothing about what they held
   * before, and "what did applying this template actually take away?" is the
   * question somebody asks the morning after.
   */
  @Post(':id/apply')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('staff:write')
  @RecordsOwnAudit()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Copy a template onto a person (replaces their permissions)',
    operationId: 'applyPermissionTemplate',
  })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  @ApiResponse({
    status: 200,
    description: 'Template copied onto the account',
    type: AppliedTemplateResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'The template holds a key that cannot be granted' })
  @ApiResponse({ status: 403, description: 'Forbidden — the target is at or above your level' })
  @ApiResponse({ status: 404, description: 'No such template, or no such staff account' })
  async apply(
    @Param('id') id: string,
    @Body() dto: ApplyPermissionTemplateDto,
    @CurrentActor() actor: PermissionActor,
    @Req() request: Request,
  ): Promise<{ data: AppliedTemplateEntity }> {
    const applied = await this.templateService.apply(id, dto.userId, actor);

    await this.auditService.record({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'permissionTemplate.apply',
      entityType: 'permissionTemplate',
      entityId: applied.template.id,
      summary:
        `Шаблон «${applied.template.name}» застосовано до ${applied.target.email}: ` +
        `${applied.after.length} дозволів (було ${applied.before.length})`,
      diff: {
        // The entity of this row is the TEMPLATE (that is what `:id` names and
        // what the entity filter will offer), so the person has to be in the diff
        // or the row cannot answer "applied to whom".
        targetUserId: applied.target.id,
        permissions: { from: [...applied.before].sort(), to: [...applied.after].sort() },
      },
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    const entity = new AppliedTemplateEntity();
    entity.template = PermissionTemplateEntity.fromRecord(applied.template);
    entity.userId = applied.target.id;
    entity.before = applied.before;
    entity.after = applied.after;

    return { data: entity };
  }
}
