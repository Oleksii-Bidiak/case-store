import { Module } from '@nestjs/common';
import { MyDevicesController } from './my-devices.controller';
import { MyDevicesRepository } from './my-devices.repository';
import { MyDevicesService } from './my-devices.service';

@Module({
  controllers: [MyDevicesController],
  providers: [MyDevicesRepository, MyDevicesService],
})
export class MyDevicesModule {}
