import { Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryListQueryDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { CategoryEntity, CategoryWithCountEntity } from './entities';

/**
 * Response envelope for a single category.
 */
interface CategoryResponse {
  data: CategoryEntity;
}

/**
 * Response envelope for a paginated category list with product counts.
 */
interface CategoryListWithCountResponse {
  data: CategoryWithCountEntity[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
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
@Controller('admin/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
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
  async findAllWithProductCount(
    @Query() query: CategoryListQueryDto,
  ): Promise<CategoryListWithCountResponse> {
    return this.categoryService.findAllWithProductCount(query);
  }

  /**
   * GET /api/admin/categories/:id
   *
   * Returns a category by ID.
   * Admin-only endpoint.
   */
  @Get(':id')
  async findById(@Param('id') id: string): Promise<CategoryResponse> {
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
  async create(@Body() dto: CreateCategoryDto): Promise<CategoryResponse> {
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
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto): Promise<CategoryResponse> {
    const category = await this.categoryService.update(id, dto);

    return { data: category };
  }

  /**
   * PATCH /api/admin/categories/:id/deactivate
   *
   * Deactivates a category (sets isActive = false). Admin-only endpoint.
   */
  @Patch(':id/deactivate')
  async deactivate(@Param('id') id: string): Promise<CategoryResponse> {
    const category = await this.categoryService.deactivate(id);

    return { data: category };
  }

  /**
   * PATCH /api/admin/categories/:id/activate
   *
   * Activates a category (sets isActive = true). Admin-only endpoint.
   */
  @Patch(':id/activate')
  async activate(@Param('id') id: string): Promise<CategoryResponse> {
    const category = await this.categoryService.activate(id);

    return { data: category };
  }
}
