import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { CarouselService } from './carousels.service';
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
 *
 * The homepage does not read this since TASK-660: it reads `GET /api/home-blocks`, which
 * shows exactly the carousels its blocks point at, in block order.
 */
@ApiTags('Carousels')
@ApiExtraModels(PublicCarouselEntity, PublicCarouselListResponse)
@Controller('carousels')
export class CarouselController {
  constructor(private readonly carouselService: CarouselService) {}

  @Get()
  @ApiOperation({
    summary: 'List published recommendation carousels with resolved products',
  })
  @ApiResponse({
    status: 200,
    description:
      'Published carousels ordered by sort order; each carries its resolved, ordered product list (possibly empty — the storefront hides empty sections)',
    type: PublicCarouselListResponse,
  })
  async findAll(): Promise<PublicCarouselListResponse> {
    return { data: await this.carouselService.findAllPublished() };
  }
}
