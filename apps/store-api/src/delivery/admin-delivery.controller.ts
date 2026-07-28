import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiExtraModels } from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { DeliverySettingDto, DeliverySettingResponse, UpdateDeliverySettingDto } from './dto';

/**
 * Admin controller for the dispatch-origin settings (TASK-080-E).
 *
 *   GET /api/admin/delivery-settings — read the current origin
 *   PUT /api/admin/delivery-settings — upsert it
 *
 * **Internal configuration, admin-only, never customer-facing.** The dispatch
 * origin exists solely to parameterise the Nova Poshta price call (cost scales
 * with distance); no public endpoint returns it, and the storefront has no
 * business knowing which warehouse the shop ships from. Kept on a separate
 * controller from the public `DeliveryController` precisely so that the guard is
 * a property of the whole class and cannot be forgotten on a later route.
 *
 * The city field in store-admin is populated from the existing public
 * `GET /api/delivery/cities` proxy, so the operator picks a real Nova Poshta
 * city and we store a valid ref rather than a hand-typed UUID.
 */
@ApiTags('Delivery')
@ApiExtraModels(DeliverySettingDto, DeliverySettingResponse)
@Controller('admin/delivery-settings')
@UseGuards(PermissionGuard)
@RequirePermission('settings:delivery')
export class AdminDeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Read the delivery dispatch-origin settings (admin)',
    operationId: 'getDeliverySettings',
  })
  @ApiResponse({
    status: 200,
    description: 'Current delivery settings; all-null when never configured',
    type: DeliverySettingResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async getSettings(): Promise<DeliverySettingResponse> {
    return { data: await this.deliveryService.getSettings() };
  }

  @Put()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update the delivery dispatch-origin settings (admin)',
    operationId: 'updateDeliverySettings',
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery settings updated',
    type: DeliverySettingResponse,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async updateSettings(@Body() dto: UpdateDeliverySettingDto): Promise<DeliverySettingResponse> {
    return { data: await this.deliveryService.updateSettings(dto) };
  }
}
