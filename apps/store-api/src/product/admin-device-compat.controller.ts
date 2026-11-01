import { Body, Controller, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionGuard, RequireAnyPermission, RequirePermission } from '../auth/permissions';
import { BulkDeviceCompatDto } from './dto';
import { BulkDeviceCompatResultEntity, DeviceModelCoverageEntity } from './entities';
import { ProductDeviceCompatService } from './product-device-compat.service';

class BulkDeviceCompatResponse {
  @ApiProperty({ type: BulkDeviceCompatResultEntity })
  data!: BulkDeviceCompatResultEntity;
}

class DeviceModelCoverageResponse {
  @ApiProperty({ type: DeviceModelCoverageEntity })
  data!: DeviceModelCoverageEntity;
}

/**
 * Device compatibility from the device side (TASK-1955), under the same
 * `/admin/devices` prefix and «Devices» tag as `AdminDeviceController`.
 *
 * A separate controller in the PRODUCT module because the work is a product write
 * with the product cache obligations, and `DeviceModule` cannot import
 * `ProductModule` (the dependency already runs the other way). No route here
 * collides with the device controller's: `compat/bulk` is a literal two-segment
 * PUT, and `models/:id/coverage` is one segment longer than `models/:id`.
 *
 * Writes go to the action log via the global `AuditInterceptor` as
 * `device.bulkUpdateCompat` (see `ENTITY_TYPE_BY_CONTROLLER`).
 */
@ApiTags('Devices')
@Controller('admin/devices')
@UseGuards(PermissionGuard)
@ApiBearerAuth('access-token')
export class AdminDeviceCompatController {
  constructor(private readonly compatService: ProductDeviceCompatService) {}

  @Put('compat/bulk')
  @HttpCode(200)
  @RequirePermission('devices:write')
  @ApiOperation({
    summary: 'Add, remove or replace device compatibility on many products (admin)',
    operationId: 'adminDeviceCompatControllerBulkUpdateCompat',
  })
  @ApiResponse({ status: 200, description: 'What changed', type: BulkDeviceCompatResponse })
  @ApiResponse({
    status: 400,
    description: 'Validation error, no models after series expansion, or unknown ids / series',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — devices:write required' })
  async bulkUpdateCompat(@Body() dto: BulkDeviceCompatDto): Promise<BulkDeviceCompatResponse> {
    const result = await this.compatService.bulkUpdate(dto);
    return { data: result };
  }

  @Get('models/:id/coverage')
  @RequireAnyPermission('devices:read', 'devices:write')
  @ApiOperation({
    summary: 'Assortment of a device model next to its series, with holes (admin)',
    operationId: 'adminDeviceCompatControllerGetModelCoverage',
  })
  @ApiParam({ name: 'id', description: 'Device model UUID' })
  @ApiResponse({ status: 200, description: 'Coverage', type: DeviceModelCoverageResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — devices:read required' })
  @ApiResponse({ status: 404, description: 'Device model not found' })
  async getModelCoverage(@Param('id') id: string): Promise<DeviceModelCoverageResponse> {
    return { data: await this.compatService.getModelCoverage(id) };
  }
}
