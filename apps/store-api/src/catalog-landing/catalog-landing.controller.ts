import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CatalogLandingService } from './catalog-landing.service';
import { CompatLandingDetailEntity, CompatLandingPageEntity } from './entities';

/** Count of the pages in the list — what the sitemap and the acceptance check read. */
class CompatLandingListMeta {
  @ApiProperty({ description: 'Number of existing compatibility landing pages', example: 312 })
  total!: number;
}

/** Response envelope for the full list of compatibility landing pages. */
class CompatLandingListResponse {
  @ApiProperty({
    type: [CompatLandingPageEntity],
    description: 'Every (category × device model) pair with at least one visible product',
  })
  data!: CompatLandingPageEntity[];

  @ApiProperty({ type: CompatLandingListMeta })
  meta!: CompatLandingListMeta;
}

/** Response envelope for a single compatibility landing page. */
class CompatLandingDetailResponse {
  @ApiProperty({ type: CompatLandingDetailEntity })
  data!: CompatLandingDetailEntity;
}

/**
 * Public compatibility-landing endpoints (TASK-490, plan 182 F3) — the pages at
 * `/catalog/<категорія>/<модель>` on the storefront, «Чохли для iPhone 15 Pro».
 *
 *   GET /catalog/compat-pages                     — every page that exists (sitemap)
 *   GET /catalog/compat-pages/:category/:device    — one page, or 404
 *
 * No auth and no visibility switch: there is no admin variant of this read. A
 * landing page is by definition a public URL, so "which ones exist" has exactly
 * one answer and both callers — the sitemap and the page itself — take it.
 */
@ApiTags('Catalog')
@ApiExtraModels(
  CompatLandingPageEntity,
  CompatLandingDetailEntity,
  CompatLandingListMeta,
  CompatLandingListResponse,
  CompatLandingDetailResponse,
)
@Controller('catalog')
export class CatalogLandingController {
  constructor(private readonly catalogLandingService: CatalogLandingService) {}

  @Get('compat-pages')
  @ApiOperation({
    summary: 'List every existing category × device-model landing page',
    operationId: 'catalogLandingControllerFindCompatPages',
  })
  @ApiResponse({
    status: 200,
    description: 'Compatibility landing pages, sorted by (category slug, device slug)',
    type: CompatLandingListResponse,
  })
  async findCompatPages(): Promise<CompatLandingListResponse> {
    const pages = await this.catalogLandingService.getCompatPages();
    return { data: pages, meta: { total: pages.length } };
  }

  @Get('compat-pages/:categorySlug/:deviceSlug')
  @ApiOperation({
    summary: 'Get one category × device-model landing page',
    operationId: 'catalogLandingControllerFindCompatPage',
  })
  @ApiParam({ name: 'categorySlug', description: 'Category slug', example: 'chohly' })
  @ApiParam({ name: 'deviceSlug', description: 'Device model slug', example: 'iphone-15-pro' })
  @ApiResponse({
    status: 200,
    description: 'The landing page — its existence is the 200 itself',
    type: CompatLandingDetailResponse,
  })
  @ApiResponse({
    status: 404,
    description: 'No such pair, or the pair has no visible products',
  })
  async findCompatPage(
    @Param('categorySlug') categorySlug: string,
    @Param('deviceSlug') deviceSlug: string,
  ): Promise<CompatLandingDetailResponse> {
    return { data: await this.catalogLandingService.getCompatPage(categorySlug, deviceSlug) };
  }
}
