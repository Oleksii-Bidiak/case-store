import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
} from '@nestjs/swagger';
import { BrandService } from './brand.service';
import { CreateBrandDto, UpdateBrandDto, BrandListQueryDto, UpdateBrandStatusDto } from './dto';
import { BrandEntity } from './entities';
import { PermissionGuard, RequirePermission } from '../auth/permissions';

/**
 * Response envelope for a single brand.
 */
class BrandResponseEnvelope {
  @ApiProperty({ type: BrandEntity })
  data!: BrandEntity;
}

/**
 * Pagination metadata for the paginated admin brand list.
 */
class AdminBrandPaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 12 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 1 })
  totalPages!: number;
}

/**
 * Response envelope for the paginated admin brand list.
 */
class AdminBrandListResponse {
  @ApiProperty({ type: [BrandEntity], description: 'Brands for the current page' })
  data!: BrandEntity[];

  @ApiProperty({ type: AdminBrandPaginationMeta })
  meta!: AdminBrandPaginationMeta;
}

/**
 * Admin brand management (ADMIN role required).
 *
 *   GET   /api/brands/admin/list — paginated list (all statuses)
 *   POST  /api/brands            — create a brand
 *   PATCH /api/brands/:id        — update a brand
 *   PATCH /api/brands/:id/status — toggle active status
 *
 * Shares the `brands` route prefix with the public {@link BrandController}; the
 * literal `admin/list` segment never collides with the public root `GET /brands`.
 */
@ApiTags('Brands')
@ApiExtraModels(
  BrandEntity,
  BrandResponseEnvelope,
  AdminBrandPaginationMeta,
  AdminBrandListResponse,
)
@Controller('brands')
@UseGuards(PermissionGuard)
@RequirePermission('brands:write')
export class AdminBrandController {
  constructor(private readonly brandService: BrandService) {}

  /**
   * GET /api/brands/admin/list
   *
   * Paginated list of all brands (any status), with optional status filter and
   * name search. Admin-only.
   */
  @Get('admin/list')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List all brands including inactive (admin)',
    operationId: 'brandControllerAdminFindAll',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of brands (all statuses)',
    type: AdminBrandListResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAllAdmin(@Query() query: BrandListQueryDto): Promise<AdminBrandListResponse> {
    return this.brandService.findAllAdmin(query);
  }

  /**
   * GET /api/brands/admin/:id
   *
   * Fetch a single brand by UUID to pre-populate the admin edit form. Admin-only.
   */
  @Get('admin/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get brand by ID (admin)', operationId: 'brandControllerFindById' })
  @ApiParam({ name: 'id', description: 'Brand UUID' })
  @ApiResponse({ status: 200, description: 'Brand found', type: BrandResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Brand not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findById(@Param('id') id: string): Promise<BrandResponseEnvelope> {
    const brand = await this.brandService.findById(id);
    return { data: brand };
  }

  /**
   * POST /api/brands
   *
   * Create a brand. Slug is auto-generated from name if not provided. Admin-only.
   */
  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a brand (admin)' })
  @ApiResponse({ status: 201, description: 'Brand created', type: BrandResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'A brand with this slug already exists' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(@Body() dto: CreateBrandDto): Promise<BrandResponseEnvelope> {
    const brand = await this.brandService.create(dto);
    return { data: brand };
  }

  /**
   * PATCH /api/brands/:id
   *
   * Update an existing brand. Only provided fields are written. Admin-only.
   */
  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a brand (admin)' })
  @ApiParam({ name: 'id', description: 'Brand UUID' })
  @ApiResponse({ status: 200, description: 'Brand updated', type: BrandResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Brand not found' })
  @ApiResponse({ status: 409, description: 'A brand with this slug already exists' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
  ): Promise<BrandResponseEnvelope> {
    const brand = await this.brandService.update(id, dto);
    return { data: brand };
  }

  /**
   * PATCH /api/brands/:id/status
   *
   * Toggle a brand's active status (reversible visibility flag). Admin-only.
   */
  @Patch(':id/status')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Toggle brand active status (admin)' })
  @ApiParam({ name: 'id', description: 'Brand UUID' })
  @ApiResponse({ status: 200, description: 'Brand status updated', type: BrandResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Brand not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBrandStatusDto,
  ): Promise<BrandResponseEnvelope> {
    const brand = await this.brandService.setActive(id, dto.isActive);
    return { data: brand };
  }
}
