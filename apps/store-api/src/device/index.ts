// Device Module — public API
export { DeviceModule } from './device.module';
export { DeviceService } from './device.service';
export { DeviceController } from './device.controller';
export { AdminDeviceController } from './admin-device.controller';
export {
  DeviceRepository,
  type CreateDeviceBrandInput,
  type UpdateDeviceBrandInput,
  type CreateDeviceModelInput,
  type UpdateDeviceModelInput,
  type DeviceModelSlugRename,
  type FindModelsParams,
  type PaginatedDeviceModelsResult,
  type DeviceModelWithBrand,
  type DeviceBrandWithCount,
  type FindAdminBrandsParams,
  type PaginatedDeviceBrandsResult,
} from './device.repository';
export { DeviceBrandEntity, DeviceModelEntity } from './entities';
export {
  CreateDeviceBrandDto,
  UpdateDeviceBrandDto,
  CreateDeviceModelDto,
  UpdateDeviceModelDto,
  DeviceModelListQueryDto,
  DeviceBrandListQueryDto,
} from './dto';
