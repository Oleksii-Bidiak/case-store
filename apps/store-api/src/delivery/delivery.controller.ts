import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExtraModels, ApiOkResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DeliveryService } from './delivery.service';
import {
  DeliveryMethodsResponse,
  NpCitySearchQueryDto,
  NpWarehouseSearchQueryDto,
  NpEstimateQueryDto,
  NpCityDto,
  NpCityListResponse,
  NpWarehouseDto,
  NpWarehouseListResponse,
  NpEstimateDto,
  NpEstimateResponse,
} from './dto';

/**
 * Public Nova Poshta delivery proxy.
 *
 * The NP API key stays server-side; the storefront calls these endpoints to
 * power the city + warehouse autocompletes and the checkout shipping estimate.
 * Throttled because they fan out to the external NP API (results are cached in
 * {@link DeliveryService}). A 503 is returned when NP is unconfigured or down.
 *
 *   GET /api/delivery/cities?q=Київ
 *   GET /api/delivery/warehouses?cityRef=...&q=1
 *   GET /api/delivery/estimate?cityRef=...
 */
@ApiTags('Delivery')
@ApiExtraModels(
  NpCityDto,
  NpCityListResponse,
  NpWarehouseDto,
  NpWarehouseListResponse,
  NpEstimateDto,
  NpEstimateResponse,
)
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('cities')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Search Nova Poshta settlements', operationId: 'searchDeliveryCities' })
  @ApiResponse({ status: 200, description: 'Matching settlements', type: NpCityListResponse })
  @ApiResponse({ status: 503, description: 'Nova Poshta is not configured or unavailable' })
  async searchCities(@Query() query: NpCitySearchQueryDto): Promise<NpCityListResponse> {
    return { data: await this.deliveryService.searchCities(query.q) };
  }

  @Get('warehouses')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'List Nova Poshta warehouses in a city',
    operationId: 'searchDeliveryWarehouses',
  })
  @ApiResponse({
    status: 200,
    description: 'Warehouses in the city',
    type: NpWarehouseListResponse,
  })
  @ApiResponse({ status: 503, description: 'Nova Poshta is not configured or unavailable' })
  async searchWarehouses(
    @Query() query: NpWarehouseSearchQueryDto,
  ): Promise<NpWarehouseListResponse> {
    return { data: await this.deliveryService.searchWarehouses(query.cityRef, query.q) };
  }

  @Get('estimate')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Estimate shipping cost + ETA to a city',
    operationId: 'estimateDelivery',
  })
  @ApiResponse({ status: 200, description: 'Shipping estimate', type: NpEstimateResponse })
  async estimate(@Query() query: NpEstimateQueryDto): Promise<NpEstimateResponse> {
    return { data: await this.deliveryService.estimateShipping(query.cityRef) };
  }

  /**
   * What the checkout may offer right now (TASK-643): the enabled methods, the
   * courier's terms, the active pickup points and the delivery × payment matrix.
   * The storefront's delivery step renders from this — never from an env var or
   * a constant (B-6 §7) — and the server enforces the same settings and matrix
   * when the order is placed. No NP call behind it, but throttled like its
   * neighbours: it is public and reads the database.
   */
  @Get('methods')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Delivery methods available at checkout',
    description:
      'Enabled methods (fixed order NOVA_POSHTA, PICKUP, COURIER, OTHER), courier price and ' +
      'free-delivery threshold, active pickup points, and which payment methods each ' +
      'delivery method admits.',
    operationId: 'getDeliveryMethods',
  })
  @ApiOkResponse({ description: 'Checkout delivery options', type: DeliveryMethodsResponse })
  async getMethods(): Promise<DeliveryMethodsResponse> {
    return { data: await this.deliveryService.getMethods() };
  }
}
