import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
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
import {
  CreateFaqItemDto,
  UpdateFaqItemDto,
  AdminFaqListQueryDto,
  ReorderFaqItemsDto,
} from './dto';
import { FaqItemEntity } from './entities';
import { PermissionGuard, RequirePermission } from '../auth/permissions';

/**
 * Response envelope for a single FAQ item.
 */
export class FaqItemResponseEnvelope {
  @ApiProperty({ type: FaqItemEntity })
  data!: FaqItemEntity;
}

/**
 * Pagination metadata for the admin FAQ list (TASK-357).
 */
class AdminFaqPaginationMeta {
  @ApiProperty({ description: 'Total number of items matching the filters', example: 8 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page — equals `total` for an unpaginated read' })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 1 })
  totalPages!: number;
}

/**
 * Response envelope for the admin FAQ list.
 *
 * Its own class rather than the public `FaqListResponse`: the admin list carries
 * `meta`, the public one must not — reusing one class for both would have made
 * the generated OpenAPI schema promise the storefront a field it never receives.
 */
export class AdminFaqListResponse {
  @ApiProperty({ type: [FaqItemEntity], description: 'FAQ items (any status)' })
  data!: FaqItemEntity[];

  @ApiProperty({ type: AdminFaqPaginationMeta })
  meta!: AdminFaqPaginationMeta;
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
 *   GET    /api/admin/faq          — all items (any status), ordered by sortOrder
 *   PATCH  /api/admin/faq/reorder  — rewrite the complete ordering of the list
 *   GET    /api/admin/faq/:id      — single item (pre-populate the edit form)
 *   POST   /api/admin/faq          — create an item
 *   PUT    /api/admin/faq/:id      — update an item (content / toggle)
 *   DELETE /api/admin/faq/:id      — delete an item
 *
 * Every write triggers a storefront `faq` revalidation via the service.
 */
@ApiTags('FAQ')
@ApiExtraModels(
  FaqItemEntity,
  FaqItemResponseEnvelope,
  AdminFaqListResponse,
  AdminFaqPaginationMeta,
  DeleteFaqResponseEnvelope,
)
@Controller('admin/faq')
@UseGuards(PermissionGuard)
@RequirePermission('faq:write')
export class AdminFaqController {
  constructor(private readonly faqService: FaqService) {}

  /**
   * GET /api/admin/faq — all items (any status), with optional search and
   * pagination. Omitting `page`/`limit` returns the complete list. Admin-only.
   */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List all FAQ items including inactive, optional search + pagination (admin)',
  })
  @ApiResponse({
    status: 200,
    description: 'FAQ items (complete list when page/limit are omitted)',
    type: AdminFaqListResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAll(@Query() query: AdminFaqListQueryDto): Promise<AdminFaqListResponse> {
    return this.faqService.findAllAdmin(query);
  }

  /**
   * PATCH /api/admin/faq/reorder (TASK-428)
   *
   * Rewrites the COMPLETE ordering of the FAQ list — the array index becomes `sortOrder`
   * — in one advisory-locked transaction, and returns the full refreshed admin list.
   *
   * DECLARED BEFORE the `:id` routes — otherwise `reorder` is captured as an `:id`.
   */
  @Patch('reorder')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Reorder the FAQ list (admin)',
    operationId: 'adminFaqControllerReorder',
  })
  @ApiResponse({
    status: 200,
    description: 'The full refreshed admin FAQ list',
    type: AdminFaqListResponse,
  })
  @ApiResponse({ status: 400, description: 'Validation error, or REORDER_DUPLICATE_ID' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'REORDER_NOT_FOUND — an id is not in this list' })
  @ApiResponse({ status: 409, description: 'REORDER_STALE — another admin changed the list first' })
  async reorder(@Body() dto: ReorderFaqItemsDto): Promise<AdminFaqListResponse> {
    return this.faqService.reorder(dto);
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
