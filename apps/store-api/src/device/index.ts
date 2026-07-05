// Device Module — public API
export { DeviceModule } from './device.module';
export { DeviceService } from './device.service';
export { DeviceController } from './device.controller';
export { AdminDeviceController } from './admin-device.controller';
export {
  DeviceRepository,
  CreateDeviceBrandInput,
  UpdateDeviceBrandInput,
  CreateDeviceModelInput,
  UpdateDeviceModelInput,
  FindModelsParams,
  PaginatedDeviceModelsResult,
  DeviceModelWithBrand,
  DeviceBrandWithCount,
} from './device.repository';
export { DeviceBrandEntity, DeviceModelEntity } from './entities';
export {
  CreateDeviceBrandDto,
  UpdateDeviceBrandDto,
  CreateDeviceModelDto,
  UpdateDeviceModelDto,
  DeviceModelListQueryDto,
} from './dto';
