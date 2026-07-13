import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { CarouselService } from './carousels.service';
import { CarouselListQueryDto } from './dto';
import { PublicCarouselEntity } from './entities';

/**
 * Response envelope for the public carousel list.
 */
class PublicCarouselListResponse {
  @ApiProperty({
    type: [PublicCarouselEntity],
    description: 'Published carousels with resolved product lists (empty product arrays included)',
  })
  data!: PublicCarouselEntity[];
}

/**
 * Controller for public (storefront) carousel endpoints.
 *
 *   GET /api/carousels — list published carousels with resolved products
 *                        (optional ?placement=)
 */
@ApiTags('Carousels')
@ApiExtraModels(PublicCarouselEntity, PublicCarouselListResponse)
@Controller('carousels')
export class CarouselController {
  constructor(private readonly carouselService: CarouselService) {}

  @Get()
  @ApiOperation({
    summary:
      'List published recommendation carousels with resolved products, optionally filtered by placement',
  })
  @ApiResponse({
    status: 200,
    description:
      'Published carousels of the requested placement (all placements when omitted) ordered by sort order; each carries its resolved, ordered product list (possibly empty — the storefront hides empty sections)',
    type: PublicCarouselListResponse,
  })
  async findAll(@Query() query: CarouselListQueryDto): Promise<PublicCarouselListResponse> {
    return this.carouselService.findAllPublished(query);
  }
}
