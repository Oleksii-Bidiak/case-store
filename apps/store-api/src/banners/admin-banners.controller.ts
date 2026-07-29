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
import { BannerService } from './banners.service';
import {
  CreateBannerDto,
  UpdateBannerDto,
  AdminBannerListQueryDto,
  ReorderBannersDto,
} from './dto';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
// Direct file import, NOT the `../auth` barrel: the barrel pulls the auth module in and the
// resulting require cycle leaves `CurrentUser` undefined at decorator-evaluation time.
import { CurrentUser } from '../auth/decorators';
import { BannerEntity } from './entities';

/**
 * Pagination metadata for the admin banner list (TASK-357).
 */
class AdminBannerPaginationMeta {
  @ApiProperty({ description: 'Total number of items matching the filters', example: 7 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page — equals `total` for an unpaginated read' })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 1 })
  totalPages!: number;
}

/**
 * Response envelope for an admin banner list (published + drafts).
 *
 * Shared with the reorder route on purpose — the admin panel writes the reorder
 * response into the list query's cache, so the two must not drift.
 */
class AdminBannerListResponse {
  @ApiProperty({ type: [BannerEntity], description: 'Banners (all statuses, optionally filtered)' })
  data!: BannerEntity[];

  @ApiProperty({ type: AdminBannerPaginationMeta })
  meta!: AdminBannerPaginationMeta;
}

/**
 * Response envelope for a single banner.
 */
class BannerResponseEnvelope {
  @ApiProperty({ type: BannerEntity })
  data!: BannerEntity;
}

/**
 * Controller for admin banner management (ADMIN role required).
 *
 *   GET    /api/admin/banners              — list all banners (all statuses)
 *   PATCH  /api/admin/banners/reorder      — reorder one placement bucket
 *   GET    /api/admin/banners/:id          — banner by ID
 *   POST   /api/admin/banners              — create
 *   PUT    /api/admin/banners/:id          — full update
 *   PATCH  /api/admin/banners/:id/publish  — set status = PUBLISHED
 *   PATCH  /api/admin/banners/:id/unpublish— set status = DRAFT
 *   DELETE /api/admin/banners/:id          — hard delete
 */
@ApiTags('Banners')
@ApiExtraModels(
  AdminBannerListResponse,
  AdminBannerPaginationMeta,
  BannerEntity,
  BannerResponseEnvelope,
)
@Controller('admin/banners')
@UseGuards(PermissionGuard)
@RequirePermission('banners:write')
export class AdminBannerController {
  constructor(private readonly bannerService: BannerService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List all banners — all statuses, optional search + pagination (admin)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of banners (complete list when page/limit are omitted)',
    type: AdminBannerListResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAll(@Query() query: AdminBannerListQueryDto): Promise<AdminBannerListResponse> {
    return this.bannerService.findAllAdmin(query);
  }

  /**
   * PATCH /api/admin/banners/reorder (TASK-295)
   *
   * Rewrites the COMPLETE ordering of ONE placement bucket — the array index becomes
   * `sortOrder` — in one advisory-locked transaction, and returns the full refreshed admin
   * banner list (all placements).
   *
   * DECLARED BEFORE the `:id` routes — otherwise `reorder` is captured as an `:id`.
   */
  @Patch('reorder')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Reorder banners within one placement (admin)',
    operationId: 'adminBannerControllerReorder',
  })
  @ApiResponse({
    status: 200,
    description: 'The full refreshed admin banner list (all placements)',
    type: AdminBannerListResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error, an unknown placement, or REORDER_DUPLICATE_ID',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'REORDER_NOT_FOUND — an id is not in this bucket' })
  @ApiResponse({
    status: 409,
    description: 'REORDER_STALE — another admin changed this placement first',
  })
  async reorder(
    @Body() dto: ReorderBannersDto,
    @CurrentUser('id') adminUserId: string,
  ): Promise<AdminBannerListResponse> {
    return this.bannerService.reorderPlacement(dto, adminUserId);
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a banner by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Banner UUID' })
  @ApiResponse({ status: 200, description: 'Banner found', type: BannerResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findById(@Param('id') id: string): Promise<BannerResponseEnvelope> {
    const banner = await this.bannerService.findByIdAdmin(id);

    return { data: banner };
  }

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a banner (admin)' })
  @ApiResponse({ status: 201, description: 'Banner created', type: BannerResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(@Body() dto: CreateBannerDto): Promise<BannerResponseEnvelope> {
    const banner = await this.bannerService.create(dto);

    return { data: banner };
  }

  @Put(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a banner (admin)' })
  @ApiParam({ name: 'id', description: 'Banner UUID' })
  @ApiResponse({ status: 200, description: 'Banner updated', type: BannerResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBannerDto,
  ): Promise<BannerResponseEnvelope> {
    const banner = await this.bannerService.update(id, dto);

    return { data: banner };
  }

  @Patch(':id/publish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Publish a banner (admin)' })
  @ApiParam({ name: 'id', description: 'Banner UUID' })
  @ApiResponse({ status: 200, description: 'Banner published', type: BannerResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async publish(@Param('id') id: string): Promise<BannerResponseEnvelope> {
    const banner = await this.bannerService.publish(id);

    return { data: banner };
  }

  @Patch(':id/unpublish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Unpublish a banner (admin)' })
  @ApiParam({ name: 'id', description: 'Banner UUID' })
  @ApiResponse({ status: 200, description: 'Banner unpublished', type: BannerResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async unpublish(@Param('id') id: string): Promise<BannerResponseEnvelope> {
    const banner = await this.bannerService.unpublish(id);

    return { data: banner };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a banner (admin)' })
  @ApiParam({ name: 'id', description: 'Banner UUID' })
  @ApiResponse({ status: 204, description: 'Banner deleted' })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.bannerService.delete(id);
  }
}
