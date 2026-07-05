import { Module } from '@nestjs/common';
import { DeviceRepository } from './device.repository';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { AdminDeviceController } from './admin-device.controller';

/**
 * DeviceModule — device-compatibility taxonomy (TASK-190). `DeviceRepository` is
 * exported so `ProductModule` can validate compat device-model ids before
 * writing the `ProductDeviceCompat` join rows.
 */
@Module({
  controllers: [DeviceController, AdminDeviceController],
  providers: [DeviceRepository, DeviceService],
  exports: [DeviceService, DeviceRepository],
})
export class DeviceModule {}
