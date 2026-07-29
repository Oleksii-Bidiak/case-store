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
import { BlogService } from './blog.service';
import {
  CreateBlogPostDto,
  UpdateBlogPostDto,
  AdminBlogPostListQueryDto,
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
  ReorderBlogCategoriesDto,
  AdminBlogCategoryListQueryDto,
} from './dto';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
// Direct file import, NOT the `../auth` barrel: the barrel pulls the auth module in and the
// resulting require cycle leaves `CurrentUser` undefined at decorator-evaluation time.
import { CurrentUser } from '../auth/decorators';
import { BlogPostEntity, BlogCategoryEntity } from './entities';

/** Pagination metadata for paginated admin blog lists. */
class AdminBlogPaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 12 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 9 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 2 })
  totalPages!: number;
}

/** Response envelope for a paginated admin post list (all statuses). */
class AdminBlogPostListResponse {
  @ApiProperty({ type: [BlogPostEntity], description: 'Posts (all statuses) for the current page' })
  data!: BlogPostEntity[];

  @ApiProperty({ type: AdminBlogPaginationMeta })
  meta!: AdminBlogPaginationMeta;
}

/** Response envelope for a single post. */
class BlogPostResponseEnvelope {
  @ApiProperty({ type: BlogPostEntity })
  data!: BlogPostEntity;
}

/** Response envelope for a single category. */
class BlogCategoryResponseEnvelope {
  @ApiProperty({ type: BlogCategoryEntity })
  data!: BlogCategoryEntity;
}

/**
 * Response envelope for the admin category list (TASK-357).
 *
 * Shared with the reorder route on purpose — the admin panel writes the reorder
 * response into the list query's cache, so the two must not drift. Distinct from
 * the PUBLIC `BlogCategoryListResponse` in `blog.controller.ts`, which carries no
 * `meta` because the storefront hub always reads the complete strip.
 */
class AdminBlogCategoryListResponse {
  @ApiProperty({ type: [BlogCategoryEntity] })
  data!: BlogCategoryEntity[];

  @ApiProperty({ type: AdminBlogPaginationMeta })
  meta!: AdminBlogPaginationMeta;
}

/**
 * Admin blog management (ADMIN role required).
 *
 *   Posts:      GET/POST /api/admin/blog/posts, GET/PUT/DELETE /:id,
 *               PATCH /:id/publish|unpublish
 *   Categories: GET/POST /api/admin/blog/categories, GET/PUT/DELETE /:id
 */
@ApiTags('Blog')
@ApiExtraModels(
  AdminBlogPostListResponse,
  AdminBlogPaginationMeta,
  BlogPostEntity,
  BlogCategoryEntity,
  BlogPostResponseEnvelope,
  BlogCategoryResponseEnvelope,
  AdminBlogCategoryListResponse,
)
@Controller('admin/blog')
@UseGuards(PermissionGuard)
@RequirePermission('blog:write')
export class AdminBlogController {
  constructor(private readonly blogService: BlogService) {}

  // ─── categories ─────────────────────────────────────────────────────────────

  @Get('categories')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List all blog categories, optional search + pagination (admin)',
    operationId: 'adminBlogControllerFindCategories',
  })
  @ApiResponse({
    status: 200,
    description: 'Categories (complete list when page/limit are omitted)',
    type: AdminBlogCategoryListResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findCategories(
    @Query() query: AdminBlogCategoryListQueryDto,
  ): Promise<AdminBlogCategoryListResponse> {
    return this.blogService.findAllCategoriesAdmin(query);
  }

  /**
   * PATCH /api/admin/blog/categories/reorder (TASK-295)
   *
   * Rewrites the COMPLETE ordering of the blog-category list — the array index becomes
   * `sortOrder` — in one advisory-locked transaction, and returns the refreshed list.
   *
   * DECLARED BEFORE `categories/:id` — otherwise `reorder` is captured as an `:id`.
   */
  @Patch('categories/reorder')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Reorder blog categories (admin)',
    operationId: 'adminBlogControllerReorderCategories',
  })
  @ApiResponse({
    status: 200,
    description: 'The refreshed blog-category list',
    type: AdminBlogCategoryListResponse,
  })
  @ApiResponse({ status: 400, description: 'Validation error, or REORDER_DUPLICATE_ID' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'REORDER_NOT_FOUND — an unknown category id' })
  @ApiResponse({
    status: 409,
    description: 'REORDER_STALE — another admin changed the list first',
  })
  async reorderCategories(
    @Body() dto: ReorderBlogCategoriesDto,
    @CurrentUser('id') adminUserId: string,
  ): Promise<AdminBlogCategoryListResponse> {
    return this.blogService.reorderCategories(dto, adminUserId);
  }

  @Get('categories/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a blog category by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category found', type: BlogCategoryResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findCategory(@Param('id') id: string): Promise<BlogCategoryResponseEnvelope> {
    const data = await this.blogService.findCategoryById(id);
    return { data };
  }

  @Post('categories')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a blog category (admin)' })
  @ApiResponse({ status: 201, description: 'Category created', type: BlogCategoryResponseEnvelope })
  @ApiResponse({ status: 409, description: 'Slug is already taken' })
  async createCategory(@Body() dto: CreateBlogCategoryDto): Promise<BlogCategoryResponseEnvelope> {
    const data = await this.blogService.createCategory(dto);
    return { data };
  }

  @Put('categories/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a blog category (admin)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category updated', type: BlogCategoryResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Slug is already taken' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateBlogCategoryDto,
  ): Promise<BlogCategoryResponseEnvelope> {
    const data = await this.blogService.updateCategory(id, dto);
    return { data };
  }

  @Delete('categories/:id')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a blog category (admin)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 204, description: 'Category deleted' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category has posts and cannot be deleted' })
  async deleteCategory(@Param('id') id: string): Promise<void> {
    await this.blogService.deleteCategory(id);
  }

  // ─── posts ──────────────────────────────────────────────────────────────────

  @Get('posts')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all posts — any status (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of posts',
    type: AdminBlogPostListResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAll(@Query() query: AdminBlogPostListQueryDto): Promise<AdminBlogPostListResponse> {
    return this.blogService.findAllAdmin(query);
  }

  @Get('posts/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a post by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Post UUID' })
  @ApiResponse({ status: 200, description: 'Post found', type: BlogPostResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async findById(@Param('id') id: string): Promise<BlogPostResponseEnvelope> {
    const data = await this.blogService.findByIdAdmin(id);
    return { data };
  }

  @Post('posts')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a post (admin)' })
  @ApiResponse({ status: 201, description: 'Post created', type: BlogPostResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Slug is already taken' })
  async create(@Body() dto: CreateBlogPostDto): Promise<BlogPostResponseEnvelope> {
    const data = await this.blogService.create(dto);
    return { data };
  }

  @Put('posts/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a post (admin)' })
  @ApiParam({ name: 'id', description: 'Post UUID' })
  @ApiResponse({ status: 200, description: 'Post updated', type: BlogPostResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  @ApiResponse({ status: 409, description: 'Slug is already taken' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBlogPostDto,
  ): Promise<BlogPostResponseEnvelope> {
    const data = await this.blogService.update(id, dto);
    return { data };
  }

  @Patch('posts/:id/publish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Publish a post (admin)' })
  @ApiParam({ name: 'id', description: 'Post UUID' })
  @ApiResponse({ status: 200, description: 'Post published', type: BlogPostResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async publish(@Param('id') id: string): Promise<BlogPostResponseEnvelope> {
    const data = await this.blogService.publish(id);
    return { data };
  }

  @Patch('posts/:id/unpublish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Unpublish a post (admin)' })
  @ApiParam({ name: 'id', description: 'Post UUID' })
  @ApiResponse({ status: 200, description: 'Post unpublished', type: BlogPostResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async unpublish(@Param('id') id: string): Promise<BlogPostResponseEnvelope> {
    const data = await this.blogService.unpublish(id);
    return { data };
  }

  @Delete('posts/:id')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a post (admin)' })
  @ApiParam({ name: 'id', description: 'Post UUID' })
  @ApiResponse({ status: 204, description: 'Post deleted' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.blogService.delete(id);
  }
}
