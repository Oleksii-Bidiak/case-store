import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiProperty } from '@nestjs/swagger';
import { AddonServiceService } from './addon-service.service';
import { ResolvedAddonEntity } from './entities';

/**
 * Response envelope for a resolved add-on list.
 */
export class ResolvedAddonListResponse {
  @ApiProperty({ type: [ResolvedAddonEntity], description: 'Add-ons applicable to the product' })
  data!: ResolvedAddonEntity[];
}

/**
 * Public add-on-service reads (no auth, TASK-174).
 *
 *   GET /api/addon-services/resolved-for-product/:productId
 *
 * The storefront's PRIMARY path is the enriched `GET /cart`, which resolves every
 * line's add-ons in one batched pass (no N+1). This route exists for a PDP-side
 * preview and as a per-line fallback.
 */
@ApiTags('AddonServices')
@Controller('addon-services')
export class AddonServiceController {
  constructor(private readonly addonServiceService: AddonServiceService) {}

  @Get('resolved-for-product/:productId')
  @ApiOperation({
    summary: 'Resolve the add-on services applicable to a product',
    operationId: 'addonServiceControllerResolveForProduct',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Resolved add-ons', type: ResolvedAddonListResponse })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async resolveForProduct(
    @Param('productId') productId: string,
  ): Promise<ResolvedAddonListResponse> {
    const data = await this.addonServiceService.resolveForProduct(productId);
    return { data };
  }
}
