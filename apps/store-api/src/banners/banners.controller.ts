import { Controller, Get, Headers, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProperty,
  ApiExtraModels,
  ApiHeader,
} from '@nestjs/swagger';
import { BannerService } from './banners.service';
import { BannerListQueryDto } from './dto';
import { BannerEntity } from './entities';
import { PREVIEW_TOKEN_HEADER, PreviewTokenService, markPreviewResponse } from '../preview-token';

/**
 * Response envelope for a published-banner list.
 */
class BannerListResponse {
  @ApiProperty({ type: [BannerEntity], description: 'Published banners (optionally filtered)' })
  data!: BannerEntity[];
}

/**
 * Controller for public (storefront) banner endpoints.
 *
 *   GET /api/banners            — list published banners (optional ?placement=)
 *
 * With a valid `home` preview token (TASK-668) draft and scheduled banners come back too,
 * under `Cache-Control: private, no-store` + `X-Robots-Tag: noindex` — the homepage
 * preview shows the page as it will be. Any other token is ignored.
 */
@ApiTags('Banners')
@ApiExtraModels(BannerEntity, BannerListResponse)
@Controller('banners')
export class BannerController {
  constructor(
    private readonly bannerService: BannerService,
    private readonly previewTokenService: PreviewTokenService,
  ) {}

  @Get()
  @ApiHeader({
    name: 'X-Preview-Token',
    required: false,
    description: 'A signed `home` preview token — also returns draft and scheduled banners',
  })
  @ApiOperation({ summary: 'List published banners, optionally filtered by placement' })
  @ApiResponse({
    status: 200,
    description: 'Published banners ordered by placement then sort order',
    type: BannerListResponse,
  })
  async findAll(
    @Query() query: BannerListQueryDto,
    @Headers(PREVIEW_TOKEN_HEADER) previewToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BannerListResponse> {
    const scope = await this.previewTokenService.validScope(previewToken);
    if (scope?.type === 'home') {
      markPreviewResponse(response);
      return { data: await this.bannerService.findAllPublished(query, { preview: true }) };
    }
    return { data: await this.bannerService.findAllPublished(query) };
  }
}
