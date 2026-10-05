import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { DeviceService } from './device.service';
import { DeviceModelListQueryDto } from './dto';
import { DeviceBrandEntity, DeviceModelListItemEntity } from './entities';

/** Response envelope for the public device-brand list. */
class DeviceBrandListResponse {
  @ApiProperty({ type: [DeviceBrandEntity], description: 'Active device brands' })
  data!: DeviceBrandEntity[];
}

/**
 * Response envelope for the public device-model list — the light projection
 * (TASK-702). The landing SEO overrides live on `CompatLandingEntity.deviceModel`
 * and the admin routes, never on this up-to-200-row list.
 */
class DeviceModelListResponse {
  @ApiProperty({
    type: [DeviceModelListItemEntity],
    description: 'Active device models (id, brand, name, slug)',
  })
  data!: DeviceModelListItemEntity[];
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
  DeviceModelListItemEntity,
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
    return { data: await this.deviceService.getBrands(true) };
  }

  @Get('device-models')
  @ApiOperation({ summary: 'List active device models', operationId: 'deviceControllerFindModels' })
  @ApiResponse({ status: 200, description: 'Active device models', type: DeviceModelListResponse })
  async findModels(@Query() query: DeviceModelListQueryDto): Promise<DeviceModelListResponse> {
    return { data: await this.deviceService.getModels(query) };
  }
}
