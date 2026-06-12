import { Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
} from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryListQueryDto } from './dto';
import { AdminGuard } from '../auth/guards';
import { CategoryEntity, CategoryWithCountEntity } from './entities';

/**
 * Response envelope for a single category.
 *
 * Decorated class (not a bare interface) so Swagger emits a `{ data }` schema
 * matching the actual runtime payload, and Orval generates a typed client hook.
 */
class CategoryResponseEnvelope {
  @ApiProperty({ type: CategoryEntity })
  data!: CategoryEntity;
}

/**
 * Pagination metadata for paginated admin category lists.
 */
class AdminCategoryPaginationMeta {
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
 * Response envelope for a paginated category list with product counts.
 *
 * Declared as a decorated class (not a bare interface) so Swagger can emit a
 * schema and Orval generates a typed client hook for `GET /api/admin/categories`.
 */
class AdminCategoryListResponse {
  @ApiProperty({
    type: [CategoryWithCountEntity],
    description: 'Categories with product counts for the current page',
  })
  data!: CategoryWithCountEntity[];

  @ApiProperty({ type: AdminCategoryPaginationMeta })
  meta!: AdminCategoryPaginationMeta;
}

/**
 * Controller for admin category management endpoints.
 *
 * Admin endpoints (ADMIN role required):
 *   GET    /admin/categories                  — List all categories with product counts
 *   GET    /admin/categories/:id              — Get category by ID
 *   POST   /admin/categories                  — Create a new category
 *   PUT    /admin/categories/:id              — Update a category
 *   PATCH  /admin/categories/:id/deactivate   — Deactivate a category
 *   PATCH  /admin/categories/:id/activate     — Activate a category
 */
@ApiTags('Categories')
@ApiExtraModels(
  AdminCategoryListResponse,
  AdminCategoryPaginationMeta,
  CategoryWithCountEntity,
  CategoryResponseEnvelope,
)
@Controller('admin/categories')
@UseGuards(AdminGuard)
export class AdminCategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * GET /api/admin/categories
   *
   * Returns a paginated list of all categories with product counts.
   * Supports filtering by active status, parent, and text search.
   * Admin-only endpoint.
   */
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all categories with product counts (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of categories with product counts',
    type: AdminCategoryListResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAllWithProductCount(
    @Query() query: CategoryListQueryDto,
  ): Promise<AdminCategoryListResponse> {
    return this.categoryService.findAllWithProductCount(query);
  }

  /**
   * GET /api/admin/categories/:id
   *
   * Returns a category by ID.
   * Admin-only endpoint.
   */
  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get category by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category found', type: CategoryResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findById(@Param('id') id: string): Promise<CategoryResponseEnvelope> {
    const category = await this.categoryService.findById(id);

    return { data: category };
  }

  /**
   * POST /api/admin/categories
   *
   * Creates a new category. Admin-only endpoint.
   * Slug is auto-generated from name if not provided.
   */
  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a category (admin)' })
  @ApiResponse({ status: 201, description: 'Category created', type: CategoryResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseEnvelope> {
    const category = await this.categoryService.create(dto);

    return { data: category };
  }

  /**
   * PUT /api/admin/categories/:id
   *
   * Updates an existing category. Admin-only endpoint.
   * Only provided fields will be updated.
   */
  @Put(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a category (admin)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category updated', type: CategoryResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseEnvelope> {
    const category = await this.categoryService.update(id, dto);

    return { data: category };
  }

  /**
   * PATCH /api/admin/categories/:id/deactivate
   *
   * Deactivates a category (sets isActive = false). Admin-only endpoint.
   */
  @Patch(':id/deactivate')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Deactivate a category (admin)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category deactivated', type: CategoryResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async deactivate(@Param('id') id: string): Promise<CategoryResponseEnvelope> {
    const category = await this.categoryService.deactivate(id);

    return { data: category };
  }

  /**
   * PATCH /api/admin/categories/:id/activate
   *
   * Activates a category (sets isActive = true). Admin-only endpoint.
   */
  @Patch(':id/activate')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Activate a category (admin)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category activated', type: CategoryResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async activate(@Param('id') id: string): Promise<CategoryResponseEnvelope> {
    const category = await this.categoryService.activate(id);

    return { data: category };
  }
}
