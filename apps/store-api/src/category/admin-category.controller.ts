import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { CategoryService } from './category.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryListQueryDto,
  ReorderCategoriesDto,
  BulkCategoryStatusDto,
} from './dto';
import { AdminGuard } from '../auth/guards';
// Direct file import, NOT the `../auth` barrel: the barrel pulls in `auth.module` →
// `auth.controller` → … → the `../category` barrel → this file, and that require cycle
// leaves `CurrentUser` undefined at decorator-evaluation time ("CurrentUser is not a
// function"). Anything on a module cycle's edge must bypass the barrels.
import { CurrentUser } from '../auth/decorators';
import { AdminCategoryTreeNodeEntity, CategoryEntity, CategoryWithCountEntity } from './entities';

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
 * Response envelope for the FULL admin category tree (TASK-291, plan 158 §6).
 *
 * Returned by the batch reorder endpoint: the whole refreshed tree, re-read after the
 * write inside the same transaction, so the client resynchronises to server truth in one
 * round trip (rollback/resync is a single state replacement, not a diff).
 *
 * EXPORTED because `GET /api/categories/admin/tree` (`category.controller.ts`) returns the
 * exact same payload and must advertise the exact same Swagger schema — one schema name,
 * one generated Orval model, no drift between the read and the write route.
 */
export class AdminCategoryTreeResponse {
  @ApiProperty({
    type: [AdminCategoryTreeNodeEntity],
    description: 'Full admin category tree (all statuses, no depth cap)',
  })
  data!: AdminCategoryTreeNodeEntity[];
}

/**
 * Controller for admin category management endpoints.
 *
 * Admin endpoints (ADMIN role required):
 *   GET    /admin/categories                  — List all categories with product counts
 *   PATCH  /admin/categories/reorder          — Batch reorder / reparent (tree)
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
  AdminCategoryTreeResponse,
  AdminCategoryTreeNodeEntity,
)
@Controller('admin/categories')
@UseGuards(AdminGuard)
export class AdminCategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * PATCH /api/admin/categories/reorder
   *
   * Batch reorder / reparent of the category tree — the ONLY writer of `sortOrder`
   * (TASK-291, plan 158 §3.4). Each group carries the COMPLETE, FINAL child list of one
   * parent bucket; the array index becomes `sortOrder`. Applied in ONE advisory-locked
   * transaction; returns the full refreshed admin tree.
   *
   * DECLARED BEFORE the `:id` routes — otherwise `reorder` is captured as an `:id`.
   */
  @Patch('reorder')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Batch reorder / reparent categories (admin)',
    operationId: 'adminCategoryControllerReorder',
  })
  @ApiResponse({
    status: 200,
    description: 'The full refreshed admin category tree',
    schema: { $ref: getSchemaPath(AdminCategoryTreeResponse) },
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error or a rejected move (cycle / max depth / self-parent / duplicate id)',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Unknown category or parent id' })
  @ApiResponse({
    status: 409,
    description: 'CATEGORY_TREE_STALE — another admin changed the tree first',
  })
  async reorder(
    @Body() dto: ReorderCategoriesDto,
    @CurrentUser('id') adminUserId: string,
  ): Promise<AdminCategoryTreeResponse> {
    return this.categoryService.reorderTree(dto, adminUserId);
  }

  /**
   * PATCH /api/admin/categories/status
   *
   * Bulk activate / deactivate (TASK-293). Writes `isActive` on exactly the named ids —
   * NO CASCADE to descendants — in one transaction, and returns the full refreshed admin
   * tree so the panel resyncs in a single round-trip (as `reorder` does).
   *
   * DECLARED BEFORE the `:id` routes, for the same reason `reorder` is — otherwise
   * `status` is captured as an `:id`.
   */
  @Patch('status')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Bulk activate / deactivate categories (admin)',
    operationId: 'adminCategoryControllerSetStatusMany',
  })
  @ApiResponse({
    status: 200,
    description: 'The full refreshed admin category tree',
    schema: { $ref: getSchemaPath(AdminCategoryTreeResponse) },
  })
  @ApiResponse({ status: 400, description: 'Validation error — empty, oversized or non-UUID ids' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Unknown category id' })
  async setStatusMany(
    @Body() dto: BulkCategoryStatusDto,
    @CurrentUser('id') adminUserId: string,
  ): Promise<AdminCategoryTreeResponse> {
    return this.categoryService.setStatusMany(dto.ids, dto.isActive, adminUserId);
  }

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
    @CurrentUser('id') adminUserId: string,
  ): Promise<CategoryResponseEnvelope> {
    const category = await this.categoryService.update(id, dto, adminUserId);

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
  async deactivate(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
  ): Promise<CategoryResponseEnvelope> {
    const category = await this.categoryService.deactivate(id, adminUserId);

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
  async activate(
    @Param('id') id: string,
    @CurrentUser('id') adminUserId: string,
  ): Promise<CategoryResponseEnvelope> {
    const category = await this.categoryService.activate(id, adminUserId);

    return { data: category };
  }
}
