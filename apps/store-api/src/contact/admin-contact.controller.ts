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
import { ContactMessageListQueryDto, UpdateContactMessageDto } from './dto';
import { ContactMessageEntity } from './entities';
import { AdminGuard } from '../auth';

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
 * Admin-only contact-inbox endpoints (ADMIN role required via AdminGuard).
 *
 *   GET   /api/contact/admin              — inbox list (status filter, newest first)
 *   GET   /api/contact/admin/unread-count — unread (NEW) count for the sidebar badge
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
)
@Controller('contact/admin')
@UseGuards(AdminGuard)
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
