import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { BrandService } from './brand.service';
import { BrandEntity } from './entities';
import { PublicBrandListQueryDto } from './dto';

/**
 * Response envelope for the public brand list.
 */
class BrandListResponse {
  @ApiProperty({ type: [BrandEntity], description: 'Active brands' })
  data!: BrandEntity[];
}

/**
 * Public brand browsing (no auth required).
 *
 *   GET /api/brands — active brands for the storefront filter + strip
 */
@ApiTags('Brands')
@ApiExtraModels(BrandEntity, BrandListResponse)
@Controller('brands')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  /**
   * GET /api/brands
   *
   * Returns all active brands (unpaginated) for the storefront manufacturer
   * filter and the "Популярні бренди" strip. Public — no authentication.
   *
   * `?categoryId=` narrows the list to brands that actually stock something in
   * that category subtree (TASK-414); omitted, the response is unchanged.
   */
  @Get()
  @ApiOperation({ summary: 'List active brands' })
  @ApiResponse({
    status: 200,
    description: 'List of active brands',
    type: BrandListResponse,
  })
  async findAll(@Query() query: PublicBrandListQueryDto): Promise<BrandListResponse> {
    return this.brandService.findAllActive(query.categoryId);
  }
}
