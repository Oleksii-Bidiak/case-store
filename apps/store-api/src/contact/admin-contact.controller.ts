import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ContactService } from './contact.service';
import {
  BulkContactMessageStatusDto,
  ContactMessageListQueryDto,
  UpdateContactMessageDto,
} from './dto';
import { ContactMessageEntity } from './entities';
import { PermissionGuard, RequirePermission } from '../auth/permissions';

/**
 * Pagination + unread-count metadata for the admin inbox. Declared as a
 * decorated class so Swagger emits a schema and Orval generates a typed model.
 */
class ContactInboxMeta {
  @ApiProperty({ description: 'Total number of items', example: 42 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 3 })
  totalPages!: number;

  @ApiProperty({ description: 'Count of unread (NEW) messages', example: 5 })
  unread!: number;
}

/**
 * Response envelope for the admin inbox list.
 */
class ContactInboxResponse {
  @ApiProperty({ type: [ContactMessageEntity], description: 'Messages for the current page' })
  data!: ContactMessageEntity[];

  @ApiProperty({ type: ContactInboxMeta })
  meta!: ContactInboxMeta;
}

/**
 * Response envelope for a single contact message.
 */
class ContactMessageResponse {
  @ApiProperty({ type: ContactMessageEntity })
  data!: ContactMessageEntity;
}

/**
 * What a bulk status call reports back: how many rows the database actually
 * wrote — which is the number the operator's confirmation should quote, not the
 * number they selected.
 */
class BulkContactMessageStatusResult {
  @ApiProperty({ description: 'Messages written', example: 15 })
  updatedCount!: number;
}

class BulkContactMessageStatusResponse {
  @ApiProperty({ type: BulkContactMessageStatusResult })
  data!: BulkContactMessageStatusResult;
}

/**
 * Unread-count payload for the sidebar badge.
 */
class ContactUnreadData {
  @ApiProperty({ description: 'Count of unread (NEW) messages', example: 5 })
  unread!: number;
}

/**
 * Response envelope for the unread-count endpoint.
 */
class ContactUnreadResponse {
  @ApiProperty({ type: ContactUnreadData })
  data!: ContactUnreadData;
}

/**
 * Admin-only contact-inbox endpoints. `messages:read` at class level; the one
 * mutating route overrides to `messages:write` (TASK-334).
 *
 *   GET   /api/contact/admin              — inbox list (status filter, sorting)
 *   GET   /api/contact/admin/unread-count — unread (NEW) count for the sidebar badge
 *   PATCH /api/contact/admin/status       — bulk status change over a selection
 *   GET   /api/contact/admin/:id          — single message
 *   PATCH /api/contact/admin/:id          — change status / set admin note
 */
@ApiTags('Contact')
@ApiExtraModels(
  ContactMessageEntity,
  ContactInboxMeta,
  ContactInboxResponse,
  ContactMessageResponse,
  ContactUnreadData,
  ContactUnreadResponse,
  BulkContactMessageStatusResult,
  BulkContactMessageStatusResponse,
)
@Controller('contact/admin')
@UseGuards(PermissionGuard)
@RequirePermission('messages:read')
export class AdminContactController {
  constructor(private readonly contactService: ContactService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List contact messages (admin)', operationId: 'adminContactList' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter: NEW | IN_PROGRESS | READ | ARCHIVED',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (max 100)' })
  @ApiQuery({ name: 'sortBy', required: false, description: 'Sort: createdAt | status | name' })
  @ApiQuery({ name: 'sortOrder', required: false, description: 'asc | desc' })
  @ApiResponse({ status: 200, description: 'Paginated inbox', type: ContactInboxResponse })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async list(@Query() query: ContactMessageListQueryDto): Promise<ContactInboxResponse> {
    return this.contactService.findAllAdmin(query);
  }

  @Get('unread-count')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Unread (NEW) message count (admin)',
    operationId: 'adminContactUnreadCount',
  })
  @ApiResponse({ status: 200, description: 'Unread count', type: ContactUnreadResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async unreadCount(): Promise<ContactUnreadResponse> {
    const unread = await this.contactService.unreadCount();
    return { data: { unread } };
  }

  /**
   * PATCH /api/contact/admin/status
   *
   * Write one status onto the operator's whole selection (TASK-354) — the bulk
   * form of `PATCH :id` below, in one transaction. Not destructive: every status
   * is reachable again from the same control, so no confirmation gate.
   *
   * DECLARED BEFORE the `:id` routes. Express resolves in declaration order, so
   * a `@Patch(':id')` above this one would swallow `status` as an id — and the
   * failure would surface as a 404 about a message that was never requested.
   *
   * Overrides to `messages:write` for the same reason the per-row PATCH does:
   * the class-level grant is read-only, and a batch write must not be reachable
   * with it. (Auditing does NOT depend on this override — `AuditInterceptor`
   * fires on any mutating request whose handler OR class carries
   * `@RequirePermission`, and the class-level one already qualifies.)
   */
  @Patch('status')
  @RequirePermission('messages:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Set the status of many contact messages (admin)',
    operationId: 'adminContactUpdateStatusMany',
  })
  @ApiResponse({
    status: 200,
    description: 'Number of messages written',
    type: BulkContactMessageStatusResponse,
  })
  @ApiResponse({ status: 400, description: 'Validation error — empty, oversized or non-UUID ids' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Unknown message id — nothing was written' })
  async updateStatusMany(
    @Body() dto: BulkContactMessageStatusDto,
  ): Promise<BulkContactMessageStatusResponse> {
    const updatedCount = await this.contactService.updateStatusMany(dto.ids, dto.status);

    return { data: { updatedCount } };
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a contact message by id (admin)', operationId: 'adminContactGet' })
  @ApiParam({ name: 'id', description: 'Contact message UUID' })
  @ApiResponse({ status: 200, description: 'Message found', type: ContactMessageResponse })
  @ApiResponse({ status: 404, description: 'Message not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findById(@Param('id') id: string): Promise<ContactMessageResponse> {
    const message = await this.contactService.findByIdAdmin(id);
    return { data: message };
  }

  @Patch(':id')
  @RequirePermission('messages:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update a contact message — status / admin note (admin)',
    operationId: 'adminContactUpdate',
  })
  @ApiParam({ name: 'id', description: 'Contact message UUID' })
  @ApiResponse({ status: 200, description: 'Message updated', type: ContactMessageResponse })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContactMessageDto,
  ): Promise<ContactMessageResponse> {
    const message = await this.contactService.update(id, dto);
    return { data: message };
  }
}
