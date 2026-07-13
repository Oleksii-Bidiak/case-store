import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CategoryListQueryDto } from './dto';
import { CategoryEntity, CategoryTreeNodeEntity, CategoryWithCountEntity } from './entities';
import { AdminCategoryTreeResponse } from './admin-category.controller';
import { AdminGuard } from '../auth/guards';

/**
 * Pagination metadata for paginated category responses.
 */
class CategoryPaginationMeta {
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
 * Response envelope for a paginated category list.
 */
class CategoryListResponse {
  @ApiProperty({ type: [CategoryEntity], description: 'Root categories for the current page' })
  data!: CategoryEntity[];

  @ApiProperty({ type: CategoryPaginationMeta })
  meta!: CategoryPaginationMeta;
}

/**
 * Response envelope for the category tree.
 */
class CategoryTreeResponse {
  @ApiProperty({
    type: [CategoryTreeNodeEntity],
    description: 'Active categories nested as a tree',
  })
  data!: CategoryTreeNodeEntity[];
}

/**
 * Response envelope for a category with product count.
 */
class CategoryWithCountResponse {
  @ApiProperty({ type: CategoryWithCountEntity })
  data!: CategoryWithCountEntity;

  @ApiProperty({ description: 'Number of products in the category', example: 5 })
  productCount!: number;
}

/**
 * Controller for public category browsing endpoints.
 *
 * Public endpoints (no auth required):
 *   GET  /categories/tree   — Get full category tree for navigation
 *   GET  /categories        — List root categories (paginated)
 *   GET  /categories/:slug  — Get category by slug with product count
 */
@ApiTags('Categories')
@ApiExtraModels(
  CategoryEntity,
  CategoryTreeNodeEntity,
  CategoryWithCountEntity,
  CategoryPaginationMeta,
  CategoryListResponse,
  CategoryTreeResponse,
  CategoryWithCountResponse,
)
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * GET /api/categories/tree
   *
   * Returns the full category tree for navigation menus and breadcrumbs.
   * Only active categories are included.
   * Public endpoint — no authentication required.
   */
  @Get('tree')
  @ApiOperation({ summary: 'Get category tree' })
  @ApiResponse({
    status: 200,
    description: 'Category tree for navigation',
    type: CategoryTreeResponse,
  })
  async getCategoryTree(): Promise<CategoryTreeResponse> {
    return this.categoryService.getCategoryTree();
  }

  /**
   * GET /api/categories/admin/tree
   *
   * Returns the FULL category tree including INACTIVE categories (TASK-236),
   * with NO structural depth cap and with `parentId` / `productCount` / `depth`
   * on every node (TASK-291, plan 158 §3.3 — the flat admin read). Admin-only —
   * backs the admin category tree widget plus the product form's leaf-category
   * picker. Same per-route `AdminGuard` bypass pattern as
   * `GET /products/admin/list` (TASK-230). Declared before `@Get(':slug')` so
   * the literal `admin/tree` path is never captured as a slug.
   *
   * The payload is a strict superset of the public tree node, so the schema is the
   * SAME `AdminCategoryTreeResponse` the reorder endpoint returns — one schema, one
   * generated Orval model.
   */
  @Get('admin/tree')
  @UseGuards(AdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get full category tree including inactive (admin)',
    operationId: 'categoryControllerGetAdminTree',
  })
  @ApiResponse({
    status: 200,
    description: 'Full category tree (all statuses) for admin tooling',
    type: AdminCategoryTreeResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async getCategoryTreeForAdmin(): Promise<AdminCategoryTreeResponse> {
    return this.categoryService.getCategoryTreeForAdmin();
  }

  /**
   * GET /api/categories
   *
   * Returns a paginated list of ACTIVE root categories (parentId = null).
   * Public endpoint — no authentication required. The `isActive` query param is
   * NOT honoured here (TASK-297): an inactive category is withdrawn from sale, so
   * the public list is always active-only. Admin listing lives at
   * `GET /api/admin/categories`.
   */
  @Get()
  @ApiOperation({ summary: 'List active root categories' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of root categories',
    type: CategoryListResponse,
  })
  async getRootCategories(@Query() query: CategoryListQueryDto): Promise<CategoryListResponse> {
    return this.categoryService.getRootCategories(query);
  }

  /**
   * GET /api/categories/:slug
   *
   * Returns a category by slug with its product count.
   * Public endpoint — no authentication required. A DEACTIVATED category 404s
   * here (TASK-297), exactly as a deactivated product does on the PDP.
   */
  @Get(':slug')
  @ApiOperation({ summary: 'Get category by slug' })
  @ApiParam({ name: 'slug', description: 'Category URL slug' })
  @ApiResponse({
    status: 200,
    description: 'Category with product count',
    type: CategoryWithCountResponse,
  })
  @ApiResponse({ status: 404, description: 'Category not found or deactivated' })
  async findBySlug(@Param('slug') slug: string): Promise<CategoryWithCountResponse> {
    return this.categoryService.findBySlug(slug);
  }
}
