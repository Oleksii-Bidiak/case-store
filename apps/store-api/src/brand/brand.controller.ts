import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { BrandService } from './brand.service';
import { BrandEntity } from './entities';

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
   */
  @Get()
  @ApiOperation({ summary: 'List active brands' })
  @ApiResponse({
    status: 200,
    description: 'List of active brands',
    type: BrandListResponse,
  })
  async findAll(): Promise<BrandListResponse> {
    return this.brandService.findAllActive();
  }
}
