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
import { PageService } from './pages.service';
import { CreatePageDto, UpdatePageDto, AdminPageListQueryDto, ReorderPagesDto } from './dto';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { PageEntity } from './entities';

/**
 * Pagination metadata for paginated admin page lists.
 */
class AdminPagePaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 5 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 1 })
  totalPages!: number;
}

/**
 * Response envelope for a paginated admin page list (published + drafts).
 */
class AdminPageListResponse {
  @ApiProperty({
    type: [PageEntity],
    description: 'Pages (published + drafts) for the current page',
  })
  data!: PageEntity[];

  @ApiProperty({ type: AdminPagePaginationMeta })
  meta!: AdminPagePaginationMeta;
}

/**
 * Response envelope for a single page.
 */
class PageResponseEnvelope {
  @ApiProperty({ type: PageEntity })
  data!: PageEntity;
}

/**
 * Controller for admin static-page management (ADMIN role required).
 *
 *   GET    /api/admin/pages              — list all pages (published + drafts)
 *   PATCH  /api/admin/pages/reorder      — rewrite the complete ordering of the list
 *   GET    /api/admin/pages/:id          — page by ID
 *   POST   /api/admin/pages              — create
 *   PUT    /api/admin/pages/:id          — full update
 *   PATCH  /api/admin/pages/:id/publish  — set isActive = true
 *   PATCH  /api/admin/pages/:id/unpublish— set isActive = false
 *   DELETE /api/admin/pages/:id          — hard delete
 */
@ApiTags('Pages')
@ApiExtraModels(AdminPageListResponse, AdminPagePaginationMeta, PageEntity, PageResponseEnvelope)
@Controller('admin/pages')
@UseGuards(PermissionGuard)
@RequirePermission('pages:write')
export class AdminPageController {
  constructor(private readonly pageService: PageService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List all pages — published + drafts, optional search + pagination (admin)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of pages (complete list when page/limit are omitted)',
    type: AdminPageListResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAll(@Query() query: AdminPageListQueryDto): Promise<AdminPageListResponse> {
    return this.pageService.findAllAdmin(query);
  }

  /**
   * PATCH /api/admin/pages/reorder (TASK-428)
   *
   * Rewrites the COMPLETE ordering of the static-page list — the array index becomes
   * `sortOrder` — in one advisory-locked transaction, and returns the full refreshed
   * admin list.
   *
   * DECLARED BEFORE the `:id` routes — otherwise `reorder` is captured as an `:id`.
   */
  @Patch('reorder')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Reorder the static-page list (admin)',
    operationId: 'adminPageControllerReorder',
  })
  @ApiResponse({
    status: 200,
    description: 'The full refreshed admin page list',
    type: AdminPageListResponse,
  })
  @ApiResponse({ status: 400, description: 'Validation error, or REORDER_DUPLICATE_ID' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'REORDER_NOT_FOUND — an id is not in this list' })
  @ApiResponse({ status: 409, description: 'REORDER_STALE — another admin changed the list first' })
  async reorder(@Body() dto: ReorderPagesDto): Promise<AdminPageListResponse> {
    return this.pageService.reorder(dto);
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a page by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Page UUID' })
  @ApiResponse({ status: 200, description: 'Page found', type: PageResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Page not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findById(@Param('id') id: string): Promise<PageResponseEnvelope> {
    const page = await this.pageService.findByIdAdmin(id);

    return { data: page };
  }

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a page (admin)' })
  @ApiResponse({ status: 201, description: 'Page created', type: PageResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Slug is already taken' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(@Body() dto: CreatePageDto): Promise<PageResponseEnvelope> {
    const page = await this.pageService.create(dto);

    return { data: page };
  }

  @Put(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a page (admin)' })
  @ApiParam({ name: 'id', description: 'Page UUID' })
  @ApiResponse({ status: 200, description: 'Page updated', type: PageResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Page not found' })
  @ApiResponse({ status: 409, description: 'Slug is already taken' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(@Param('id') id: string, @Body() dto: UpdatePageDto): Promise<PageResponseEnvelope> {
    const page = await this.pageService.update(id, dto);

    return { data: page };
  }

  @Patch(':id/publish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Publish a page (admin)' })
  @ApiParam({ name: 'id', description: 'Page UUID' })
  @ApiResponse({ status: 200, description: 'Page published', type: PageResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Page not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async publish(@Param('id') id: string): Promise<PageResponseEnvelope> {
    const page = await this.pageService.publish(id);

    return { data: page };
  }

  @Patch(':id/unpublish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Unpublish a page (admin)' })
  @ApiParam({ name: 'id', description: 'Page UUID' })
  @ApiResponse({ status: 200, description: 'Page unpublished', type: PageResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Page not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async unpublish(@Param('id') id: string): Promise<PageResponseEnvelope> {
    const page = await this.pageService.unpublish(id);

    return { data: page };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a page (admin)' })
  @ApiParam({ name: 'id', description: 'Page UUID' })
  @ApiResponse({ status: 204, description: 'Page deleted' })
  @ApiResponse({ status: 404, description: 'Page not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.pageService.delete(id);
  }
}
