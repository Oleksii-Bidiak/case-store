import { Controller, Get, Headers, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
  ApiHeader,
} from '@nestjs/swagger';
import { PREVIEW_TOKEN_HEADER, PreviewTokenService, markPreviewResponse } from '../preview-token';
import { PageService } from './pages.service';
import { PageListQueryDto, PageDetailQueryDto } from './dto';
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
  constructor(
    private readonly pageService: PageService,
    private readonly previewTokenService: PreviewTokenService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List published pages' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of published pages',
    type: PageListResponse,
  })
  async findAll(@Query() query: PageListQueryDto): Promise<PageListResponse> {
    const page = await this.pageService.findAll(query);
    return { data: page.items, meta: page.meta };
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'Get a published page by slug, optionally required to be of a given kind',
  })
  @ApiParam({ name: 'slug', description: 'Page URL slug' })
  @ApiResponse({ status: 200, description: 'Published page', type: PageResponseEnvelope })
  @ApiResponse({
    status: 404,
    description: 'Page not found, not published, or not of the requested kind',
  })
  @ApiHeader({
    name: 'X-Preview-Token',
    required: false,
    description: 'A signed preview token for THIS page (TASK-668) — serves its draft, uncached',
  })
  async findBySlug(
    @Param('slug') slug: string,
    @Query() query: PageDetailQueryDto,
    @Headers(PREVIEW_TOKEN_HEADER) previewToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PageResponseEnvelope> {
    // A signed preview of exactly this page (TASK-668) serves it in any status; any
    // other token falls through to the ordinary published-only read, unchanged.
    const scope = await this.previewTokenService.validScope(previewToken);
    if (scope?.type === 'page' && scope.id) {
      const preview = await this.pageService.findPreviewBySlug(slug, query.kind, scope.id);
      if (preview) {
        markPreviewResponse(response);
        return { data: preview };
      }
    }
    const page = await this.pageService.findPublishedBySlug(slug, query.kind);

    return { data: page };
  }
}
