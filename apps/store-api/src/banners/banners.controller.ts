import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { BannerService } from './banners.service';
import { BannerListQueryDto } from './dto';
import { BannerEntity } from './entities';

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
 */
@ApiTags('Banners')
@ApiExtraModels(BannerEntity, BannerListResponse)
@Controller('banners')
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  @Get()
  @ApiOperation({ summary: 'List published banners, optionally filtered by placement' })
  @ApiResponse({
    status: 200,
    description: 'Published banners ordered by placement then sort order',
    type: BannerListResponse,
  })
  async findAll(@Query() query: BannerListQueryDto): Promise<BannerListResponse> {
    return this.bannerService.findAllPublished(query);
  }
}
