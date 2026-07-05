import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
} from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { BlogPostListQueryDto } from './dto';
import { BlogPostEntity, BlogCategoryEntity } from './entities';

/** Pagination metadata for paginated blog responses. */
class BlogPaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 12 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 9 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 2 })
  totalPages!: number;
}

/** Response envelope for a paginated published-post list. */
class BlogPostListResponse {
  @ApiProperty({ type: [BlogPostEntity], description: 'Published posts for the current page' })
  data!: BlogPostEntity[];

  @ApiProperty({ type: BlogPaginationMeta })
  meta!: BlogPaginationMeta;
}

/** Response envelope for a single post. */
class BlogPostResponseEnvelope {
  @ApiProperty({ type: BlogPostEntity })
  data!: BlogPostEntity;
}

/** Response envelope for the category list. */
class BlogCategoryListResponse {
  @ApiProperty({ type: [BlogCategoryEntity] })
  data!: BlogCategoryEntity[];
}

/**
 * Public (storefront) blog endpoints.
 *
 *   GET /api/blog             — list published posts (category, q, pagination)
 *   GET /api/blog/categories  — list all categories
 *   GET /api/blog/:slug       — single published post by slug
 */
@ApiTags('Blog')
@ApiExtraModels(
  BlogPostEntity,
  BlogCategoryEntity,
  BlogPaginationMeta,
  BlogPostListResponse,
  BlogPostResponseEnvelope,
  BlogCategoryListResponse,
)
@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @ApiOperation({ summary: 'List published blog posts' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of published posts',
    type: BlogPostListResponse,
  })
  async findAll(@Query() query: BlogPostListQueryDto): Promise<BlogPostListResponse> {
    return this.blogService.findAll(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List blog categories' })
  @ApiResponse({ status: 200, description: 'All blog categories', type: BlogCategoryListResponse })
  async findCategories(): Promise<BlogCategoryListResponse> {
    const data = await this.blogService.findAllCategories();
    return { data };
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a published blog post by slug' })
  @ApiParam({ name: 'slug', description: 'Post URL slug' })
  @ApiResponse({ status: 200, description: 'Published post', type: BlogPostResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Post not found or not published' })
  async findBySlug(@Param('slug') slug: string): Promise<BlogPostResponseEnvelope> {
    const post = await this.blogService.findPublishedBySlug(slug);
    return { data: post };
  }
}
