import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
} from '@nestjs/swagger';
import { FaqService } from './faq.service';
import { CreateFaqItemDto, UpdateFaqItemDto } from './dto';
import { FaqItemEntity } from './entities';
import { FaqListResponse } from './faq.controller';
import { AdminGuard } from '../auth/guards';

/**
 * Response envelope for a single FAQ item.
 */
export class FaqItemResponseEnvelope {
  @ApiProperty({ type: FaqItemEntity })
  data!: FaqItemEntity;
}

/**
 * Payload returned after a delete — the id of the removed item.
 */
class DeletedFaqId {
  @ApiProperty({ description: 'ID of the deleted FAQ item' })
  id!: string;
}

/**
 * Response envelope for a delete.
 */
export class DeleteFaqResponseEnvelope {
  @ApiProperty({ type: DeletedFaqId })
  data!: DeletedFaqId;
}

/**
 * Admin FAQ management (ADMIN role required).
 *
 *   GET    /api/admin/faq      — all items (any status), ordered by sortOrder
 *   GET    /api/admin/faq/:id  — single item (pre-populate the edit form)
 *   POST   /api/admin/faq      — create an item
 *   PUT    /api/admin/faq/:id  — update an item (content / reorder / toggle)
 *   DELETE /api/admin/faq/:id  — delete an item
 *
 * Every write triggers a storefront `faq` revalidation via the service.
 */
@ApiTags('FAQ')
@ApiExtraModels(FaqItemEntity, FaqItemResponseEnvelope, FaqListResponse, DeleteFaqResponseEnvelope)
@Controller('admin/faq')
@UseGuards(AdminGuard)
export class AdminFaqController {
  constructor(private readonly faqService: FaqService) {}

  /**
   * GET /api/admin/faq — all items (any status). Admin-only.
   */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all FAQ items including inactive (admin)' })
  @ApiResponse({ status: 200, description: 'All FAQ items', type: FaqListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAll(): Promise<FaqListResponse> {
    return this.faqService.findAllAdmin();
  }

  /**
   * GET /api/admin/faq/:id — single item to pre-populate the edit form. Admin-only.
   */
  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get FAQ item by ID (admin)' })
  @ApiParam({ name: 'id', description: 'FAQ item UUID' })
  @ApiResponse({ status: 200, description: 'FAQ item found', type: FaqItemResponseEnvelope })
  @ApiResponse({ status: 404, description: 'FAQ item not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findById(@Param('id') id: string): Promise<FaqItemResponseEnvelope> {
    const item = await this.faqService.findById(id);
    return { data: item };
  }

  /**
   * POST /api/admin/faq — create a FAQ item. Admin-only.
   */
  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a FAQ item (admin)' })
  @ApiResponse({ status: 201, description: 'FAQ item created', type: FaqItemResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(@Body() dto: CreateFaqItemDto): Promise<FaqItemResponseEnvelope> {
    const item = await this.faqService.create(dto);
    return { data: item };
  }

  /**
   * PUT /api/admin/faq/:id — update a FAQ item (content, sortOrder, isActive).
   * Only provided fields are written. Admin-only.
   */
  @Put(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a FAQ item (admin)' })
  @ApiParam({ name: 'id', description: 'FAQ item UUID' })
  @ApiResponse({ status: 200, description: 'FAQ item updated', type: FaqItemResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'FAQ item not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFaqItemDto,
  ): Promise<FaqItemResponseEnvelope> {
    const item = await this.faqService.update(id, dto);
    return { data: item };
  }

  /**
   * DELETE /api/admin/faq/:id — delete a FAQ item. Admin-only.
   */
  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a FAQ item (admin)' })
  @ApiParam({ name: 'id', description: 'FAQ item UUID' })
  @ApiResponse({ status: 200, description: 'FAQ item deleted', type: DeleteFaqResponseEnvelope })
  @ApiResponse({ status: 404, description: 'FAQ item not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async remove(@Param('id') id: string): Promise<DeleteFaqResponseEnvelope> {
    const data = await this.faqService.remove(id);
    return { data };
  }
}
