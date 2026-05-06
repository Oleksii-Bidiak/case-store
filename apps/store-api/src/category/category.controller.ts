import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { CategoryListQueryDto } from './dto';
import { CategoryEntity, CategoryTreeNodeEntity, CategoryWithCountEntity } from './entities';

/**
 * Response envelope for a paginated category list.
 */
interface CategoryListResponse {
  data: CategoryEntity[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Response envelope for the category tree.
 */
interface CategoryTreeResponse {
  data: CategoryTreeNodeEntity[];
}

/**
 * Response envelope for a category with product count.
 */
interface CategoryWithCountResponse {
  data: CategoryWithCountEntity;
  productCount: number;
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
  @ApiResponse({ status: 200, description: 'Category tree for navigation' })
  async getCategoryTree(): Promise<CategoryTreeResponse> {
    return this.categoryService.getCategoryTree();
  }

  /**
   * GET /api/categories
   *
   * Returns a paginated list of root categories (parentId = null).
   * Supports filtering by active status and sorting.
   * Public endpoint — no authentication required.
   */
  @Get()
  @ApiOperation({ summary: 'List root categories' })
  @ApiResponse({ status: 200, description: 'Paginated list of root categories' })
  async getRootCategories(@Query() query: CategoryListQueryDto): Promise<CategoryListResponse> {
    return this.categoryService.getRootCategories(query);
  }

  /**
   * GET /api/categories/:slug
   *
   * Returns a category by slug with its product count.
   * Public endpoint — no authentication required.
   */
  @Get(':slug')
  @ApiOperation({ summary: 'Get category by slug' })
  @ApiParam({ name: 'slug', description: 'Category URL slug' })
  @ApiResponse({ status: 200, description: 'Category with product count' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findBySlug(@Param('slug') slug: string): Promise<CategoryWithCountResponse> {
    return this.categoryService.findBySlug(slug);
  }
}
