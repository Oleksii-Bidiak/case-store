import { Controller, Get, Post, Put, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
} from '@nestjs/swagger';
import { DeviceService } from './device.service';
import {
  CreateDeviceBrandDto,
  UpdateDeviceBrandDto,
  CreateDeviceModelDto,
  UpdateDeviceModelDto,
  DeviceModelListQueryDto,
} from './dto';
import { AdminGuard } from '../auth/guards';
import { DeviceBrandEntity, DeviceModelEntity } from './entities';

/** Envelope for a single device brand. */
class DeviceBrandResponseEnvelope {
  @ApiProperty({ type: DeviceBrandEntity })
  data!: DeviceBrandEntity;
}

/** Envelope for the admin device-brand list (with model counts). */
class AdminDeviceBrandListResponse {
  @ApiProperty({ type: [DeviceBrandEntity], description: 'Device brands with model counts' })
  data!: DeviceBrandEntity[];
}

/** Envelope for a single device model. */
class DeviceModelResponseEnvelope {
  @ApiProperty({ type: DeviceModelEntity })
  data!: DeviceModelEntity;
}

/** Pagination metadata for the admin device-model list. */
class AdminDeviceModelPaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 42 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 50 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 1 })
  totalPages!: number;
}

/** Envelope for the paginated admin device-model list. */
class AdminDeviceModelListResponse {
  @ApiProperty({ type: [DeviceModelEntity], description: 'Device models for the current page' })
  data!: DeviceModelEntity[];

  @ApiProperty({ type: AdminDeviceModelPaginationMeta })
  meta!: AdminDeviceModelPaginationMeta;
}

/**
 * Admin device-taxonomy management (TASK-190). ADMIN role required for every
 * route. Covers full CRUD + an `isActive` toggle for both device brands and
 * device models.
 */
@ApiTags('Devices')
@ApiExtraModels(
  DeviceBrandEntity,
  DeviceModelEntity,
  DeviceBrandResponseEnvelope,
  AdminDeviceBrandListResponse,
  DeviceModelResponseEnvelope,
  AdminDeviceModelPaginationMeta,
  AdminDeviceModelListResponse,
)
@Controller('admin/devices')
@UseGuards(AdminGuard)
@ApiBearerAuth('access-token')
export class AdminDeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  // ─── Device brands ────────────────────────────────────────────────────────

  @Get('brands')
  @ApiOperation({
    summary: 'List device brands with model counts (admin)',
    operationId: 'adminDeviceControllerFindBrands',
  })
  @ApiResponse({ status: 200, description: 'Device brands', type: AdminDeviceBrandListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findBrands(): Promise<AdminDeviceBrandListResponse> {
    return this.deviceService.getBrandsWithCount();
  }

  @Get('brands/:id')
  @ApiOperation({ summary: 'Get device brand by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Device brand UUID' })
  @ApiResponse({ status: 200, description: 'Device brand', type: DeviceBrandResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Device brand not found' })
  async findBrandById(@Param('id') id: string): Promise<DeviceBrandResponseEnvelope> {
    return { data: await this.deviceService.findBrandById(id) };
  }

  @Post('brands')
  @ApiOperation({ summary: 'Create a device brand (admin)' })
  @ApiResponse({
    status: 201,
    description: 'Device brand created',
    type: DeviceBrandResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createBrand(@Body() dto: CreateDeviceBrandDto): Promise<DeviceBrandResponseEnvelope> {
    return { data: await this.deviceService.createBrand(dto) };
  }

  @Put('brands/:id')
  @ApiOperation({ summary: 'Update a device brand (admin)' })
  @ApiParam({ name: 'id', description: 'Device brand UUID' })
  @ApiResponse({
    status: 200,
    description: 'Device brand updated',
    type: DeviceBrandResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'Device brand not found' })
  async updateBrand(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceBrandDto,
  ): Promise<DeviceBrandResponseEnvelope> {
    return { data: await this.deviceService.updateBrand(id, dto) };
  }

  @Patch('brands/:id/activate')
  @ApiOperation({ summary: 'Activate a device brand (admin)' })
  @ApiParam({ name: 'id', description: 'Device brand UUID' })
  @ApiResponse({
    status: 200,
    description: 'Device brand activated',
    type: DeviceBrandResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'Device brand not found' })
  async activateBrand(@Param('id') id: string): Promise<DeviceBrandResponseEnvelope> {
    return { data: await this.deviceService.setBrandActive(id, true) };
  }

  @Patch('brands/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate a device brand (admin)' })
  @ApiParam({ name: 'id', description: 'Device brand UUID' })
  @ApiResponse({
    status: 200,
    description: 'Device brand deactivated',
    type: DeviceBrandResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'Device brand not found' })
  async deactivateBrand(@Param('id') id: string): Promise<DeviceBrandResponseEnvelope> {
    return { data: await this.deviceService.setBrandActive(id, false) };
  }

  // ─── Device models ────────────────────────────────────────────────────────

  @Get('models')
  @ApiOperation({
    summary: 'List device models (admin, paginated)',
    operationId: 'adminDeviceControllerFindModels',
  })
  @ApiResponse({ status: 200, description: 'Device models', type: AdminDeviceModelListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findModels(@Query() query: DeviceModelListQueryDto): Promise<AdminDeviceModelListResponse> {
    return this.deviceService.getModelsPaginated(query);
  }

  @Get('models/:id')
  @ApiOperation({ summary: 'Get device model by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Device model UUID' })
  @ApiResponse({ status: 200, description: 'Device model', type: DeviceModelResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Device model not found' })
  async findModelById(@Param('id') id: string): Promise<DeviceModelResponseEnvelope> {
    return { data: await this.deviceService.findModelById(id) };
  }

  @Post('models')
  @ApiOperation({ summary: 'Create a device model (admin)' })
  @ApiResponse({
    status: 201,
    description: 'Device model created',
    type: DeviceModelResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Device brand not found' })
  async createModel(@Body() dto: CreateDeviceModelDto): Promise<DeviceModelResponseEnvelope> {
    return { data: await this.deviceService.createModel(dto) };
  }

  @Put('models/:id')
  @ApiOperation({ summary: 'Update a device model (admin)' })
  @ApiParam({ name: 'id', description: 'Device model UUID' })
  @ApiResponse({
    status: 200,
    description: 'Device model updated',
    type: DeviceModelResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'Device model not found' })
  async updateModel(
    @Param('id') id: string,
    @Body() dto: UpdateDeviceModelDto,
  ): Promise<DeviceModelResponseEnvelope> {
    return { data: await this.deviceService.updateModel(id, dto) };
  }

  @Patch('models/:id/activate')
  @ApiOperation({ summary: 'Activate a device model (admin)' })
  @ApiParam({ name: 'id', description: 'Device model UUID' })
  @ApiResponse({
    status: 200,
    description: 'Device model activated',
    type: DeviceModelResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'Device model not found' })
  async activateModel(@Param('id') id: string): Promise<DeviceModelResponseEnvelope> {
    return { data: await this.deviceService.setModelActive(id, true) };
  }

  @Patch('models/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate a device model (admin)' })
  @ApiParam({ name: 'id', description: 'Device model UUID' })
  @ApiResponse({
    status: 200,
    description: 'Device model deactivated',
    type: DeviceModelResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: 'Device model not found' })
  async deactivateModel(@Param('id') id: string): Promise<DeviceModelResponseEnvelope> {
    return { data: await this.deviceService.setModelActive(id, false) };
  }
}
