import { Controller, Get, Headers, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HomeBlockService } from './home-block.service';
import { PublicHomeBlockEntity } from './entities';
import { PREVIEW_TOKEN_HEADER, PreviewTokenService, markPreviewResponse } from '../preview-token';

/** Response envelope for the public homepage read. */
class PublicHomeBlockListResponse {
  @ApiProperty({ type: [PublicHomeBlockEntity] })
  data!: PublicHomeBlockEntity[];
}

/**
 * The storefront homepage as data (TASK-661):
 *
 *   GET /api/home-blocks — the visible blocks in page order, carousels resolved
 *
 * With a valid `home` preview token (TASK-668) it also returns DRAFT / SCHEDULED
 * blocks and draft carousels, each with its `status`, under `Cache-Control: private,
 * no-store` + `X-Robots-Tag: noindex`. Any other token is ignored.
 */
@ApiTags('Home blocks')
@ApiExtraModels(PublicHomeBlockEntity, PublicHomeBlockListResponse)
@Controller('home-blocks')
export class HomeBlockController {
  constructor(
    private readonly homeBlockService: HomeBlockService,
    private readonly previewTokenService: PreviewTokenService,
  ) {}

  @Get()
  @ApiHeader({
    name: 'X-Preview-Token',
    required: false,
    description: 'A signed `home` preview token — also returns draft and scheduled blocks',
  })
  @ApiOperation({
    summary: 'The homepage: visible blocks in page order, with carousels and tabs resolved',
  })
  @ApiResponse({
    status: 200,
    description:
      'PUBLISHED blocks in page order. A CAROUSEL block whose carousel is not published is ' +
      'left out; a TABS block keeps only its published tabs and is returned even with none.',
    type: PublicHomeBlockListResponse,
  })
  async findAll(
    @Headers(PREVIEW_TOKEN_HEADER) previewToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicHomeBlockListResponse> {
    const scope = await this.previewTokenService.validScope(previewToken);
    const preview = scope?.type === 'home';
    if (preview) {
      markPreviewResponse(response);
    }
    return { data: await this.homeBlockService.findPublic({ preview }) };
  }
}
