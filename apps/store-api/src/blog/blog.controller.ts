import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BlogService } from './blog.service';
import { BlogPostListQueryDto, BlogSuggestQueryDto } from './dto';
import { BlogPostEntity, BlogCategoryEntity, BlogPostSuggestionEntity } from './entities';

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

/** Response envelope for `GET /api/blog/suggest` (TASK-543). */
class BlogSuggestResponse {
  @ApiProperty({
    type: [BlogPostSuggestionEntity],
    description: 'Matching published, listed articles — id, slug, title and cover only',
  })
  data!: BlogPostSuggestionEntity[];
}

/**
 * Public (storefront) blog endpoints.
 *
 *   GET /api/blog             — list published posts (category, q, pagination)
 *   GET /api/blog/categories  — list all categories
 *   GET /api/blog/suggest     — light article suggestions for the search autocomplete
 *   GET /api/blog/:slug       — single published post by slug
 *
 * The static segments are declared BEFORE `:slug` — Nest matches in declaration
 * order, so a `suggest` route declared after it would be read as a post slug.
 */
@ApiTags('Blog')
@ApiExtraModels(
  BlogPostEntity,
  BlogCategoryEntity,
  BlogPostSuggestionEntity,
  BlogPaginationMeta,
  BlogPostListResponse,
  BlogPostResponseEnvelope,
  BlogCategoryListResponse,
  BlogSuggestResponse,
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
    const page = await this.blogService.findAll(query);
    return { data: page.items, meta: page.meta };
  }

  @Get('categories')
  @ApiOperation({ summary: 'List blog categories' })
  @ApiResponse({ status: 200, description: 'All blog categories', type: BlogCategoryListResponse })
  async findCategories(): Promise<BlogCategoryListResponse> {
    const data = await this.blogService.findAllCategories();
    return { data };
  }

  // Throttled like the product suggest: the autocomplete calls it on every
  // (debounced) keystroke.
  @Get('suggest')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Autocomplete blog-article suggestions (no article bodies)',
    description:
      'Typo-tolerant via the search index, Postgres fallback. Published, listed posts only. ' +
      'Returns id, slug, title and coverImageUrl — never `content` (TASK-543).',
  })
  @ApiResponse({ status: 200, description: 'Article suggestions', type: BlogSuggestResponse })
  @ApiResponse({ status: 400, description: 'Missing/blank q or limit out of range' })
  async suggest(@Query() query: BlogSuggestQueryDto): Promise<BlogSuggestResponse> {
    return { data: await this.blogService.suggest(query.q, query.limit) };
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
