import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiProperty } from '@nestjs/swagger';
import { AddonServiceService } from './addon-service.service';
import { PublicAddonServiceEntity, ResolvedAddonEntity } from './entities';

/**
 * Response envelope for a resolved add-on list.
 */
export class ResolvedAddonListResponse {
  @ApiProperty({ type: [ResolvedAddonEntity], description: 'Add-ons applicable to the product' })
  data!: ResolvedAddonEntity[];
}

/**
 * Response envelope for the public list of offered add-on services (TASK-561).
 */
export class PublicAddonServiceListResponse {
  @ApiProperty({
    type: [PublicAddonServiceEntity],
    description: 'Active add-on services, ordered by name',
  })
  data!: PublicAddonServiceEntity[];
}

/**
 * Public add-on-service reads (no auth, TASK-174).
 *
 *   GET /api/addon-services/active                              (TASK-561)
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

  @Get('active')
  @ApiOperation({
    summary: 'List the add-on services the store currently offers, with catalog prices',
    description:
      'Public, active-only, ordered by name. Backs the «Додаткові сервіси» block on the ' +
      "storefront's /info page. `price` is the catalog price; a product may override it.",
    operationId: 'addonServiceControllerFindActive',
  })
  @ApiResponse({
    status: 200,
    description: 'Active add-on services',
    type: PublicAddonServiceListResponse,
  })
  async findActive(): Promise<PublicAddonServiceListResponse> {
    const data = await this.addonServiceService.findPublicActive();
    return { data };
  }

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
