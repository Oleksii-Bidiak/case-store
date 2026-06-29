import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
} from '@nestjs/swagger';
import { PageService } from './pages.service';
import { PageListQueryDto } from './dto';
import { PageEntity } from './entities';

/**
 * Pagination metadata for paginated page responses.
 */
class PagePaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 5 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 1 })
  totalPages!: number;
}

/**
 * Response envelope for a paginated published-page list.
 */
class PageListResponse {
  @ApiProperty({ type: [PageEntity], description: 'Published pages for the current page' })
  data!: PageEntity[];

  @ApiProperty({ type: PagePaginationMeta })
  meta!: PagePaginationMeta;
}

/**
 * Response envelope for a single page.
 */
class PageResponseEnvelope {
  @ApiProperty({ type: PageEntity })
  data!: PageEntity;
}

/**
 * Controller for public (storefront) static-page endpoints.
 *
 *   GET /api/pages        — list published pages
 *   GET /api/pages/:slug  — single published page by slug
 */
@ApiTags('Pages')
@ApiExtraModels(PageEntity, PagePaginationMeta, PageListResponse, PageResponseEnvelope)
@Controller('pages')
export class PageController {
  constructor(private readonly pageService: PageService) {}

  @Get()
  @ApiOperation({ summary: 'List published pages' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of published pages',
    type: PageListResponse,
  })
  async findAll(@Query() query: PageListQueryDto): Promise<PageListResponse> {
    return this.pageService.findAll(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a published page by slug' })
  @ApiParam({ name: 'slug', description: 'Page URL slug' })
  @ApiResponse({ status: 200, description: 'Published page', type: PageResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Page not found or not published' })
  async findBySlug(@Param('slug') slug: string): Promise<PageResponseEnvelope> {
    const page = await this.pageService.findPublishedBySlug(slug);

    return { data: page };
  }
}
