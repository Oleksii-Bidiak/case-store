import { Module } from '@nestjs/common';
import { ProductRepository } from './product.repository';
import { ProductDeviceCompatRepository } from './product-device-compat.repository';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ProductImageRepository } from './product-image.repository';
import { ProductImageService } from './product-image.service';
import { ProductImageController } from './product-image.controller';
import { StorageModule } from '../storage';
import { SearchModule } from '../search';
import { CategoryModule } from '../category';
import { DeviceModule } from '../device';

@Module({
  // DeviceModule supplies DeviceRepository for validating device-compat ids
  // before writing the join rows (TASK-190).
  imports: [StorageModule, SearchModule, CategoryModule, DeviceModule],
  controllers: [ProductController, ProductImageController],
  providers: [
    ProductRepository,
    ProductDeviceCompatRepository,
    ProductService,
    ProductImageRepository,
    ProductImageService,
  ],
  exports: [ProductService],
})
export class ProductModule {}
