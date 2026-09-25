import { Module } from '@nestjs/common';
import { SlugRedirectModule } from '../slug-redirect';
import { DeviceRepository } from './device.repository';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { AdminDeviceController } from './admin-device.controller';

/**
 * DeviceModule — device-compatibility taxonomy (TASK-190). `DeviceRepository` is
 * exported so `ProductModule` can validate compat device-model ids before
 * writing the `ProductDeviceCompat` join rows.
 *
 * `SlugRedirectModule` supplies the repository `DeviceRepository.updateModel`
 * composes into its transaction when a model's slug is renamed (TASK-699) — a
 * model slug is a segment of the public `/catalog/<категорія>/<модель>` URL.
 */
@Module({
  imports: [SlugRedirectModule],
  controllers: [DeviceController, AdminDeviceController],
  providers: [DeviceRepository, DeviceService],
  exports: [DeviceService, DeviceRepository],
})
export class DeviceModule {}
