import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { DeviceService } from './device.service';
import { DeviceModelListQueryDto } from './dto';
import { DeviceBrandEntity, DeviceModelEntity } from './entities';

/** Response envelope for the public device-brand list. */
class DeviceBrandListResponse {
  @ApiProperty({ type: [DeviceBrandEntity], description: 'Active device brands' })
  data!: DeviceBrandEntity[];
}

/** Response envelope for the public device-model list. */
class DeviceModelListResponse {
  @ApiProperty({ type: [DeviceModelEntity], description: 'Active device models' })
  data!: DeviceModelEntity[];
}

/**
 * Public device-taxonomy endpoints (TASK-190) — feed the homepage ModelPicker
 * cascade and the catalog "Сумісний пристрій" filter. No auth; active-only.
 *
 *   GET /device-brands                          — list active device brands
 *   GET /device-models?deviceBrandId=&search=   — list active device models
 */
@ApiTags('Devices')
@ApiExtraModels(
  DeviceBrandEntity,
  DeviceModelEntity,
  DeviceBrandListResponse,
  DeviceModelListResponse,
)
@Controller()
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Get('device-brands')
  @ApiOperation({ summary: 'List active device brands', operationId: 'deviceControllerFindBrands' })
  @ApiResponse({ status: 200, description: 'Active device brands', type: DeviceBrandListResponse })
  async findBrands(): Promise<DeviceBrandListResponse> {
    return this.deviceService.getBrands(true);
  }

  @Get('device-models')
  @ApiOperation({ summary: 'List active device models', operationId: 'deviceControllerFindModels' })
  @ApiResponse({ status: 200, description: 'Active device models', type: DeviceModelListResponse })
  async findModels(@Query() query: DeviceModelListQueryDto): Promise<DeviceModelListResponse> {
    return this.deviceService.getModels(query);
  }
}
