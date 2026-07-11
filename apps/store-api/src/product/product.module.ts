import { Module } from '@nestjs/common';
import { ProductRepository } from './product.repository';
import { ProductDeviceCompatRepository } from './product-device-compat.repository';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ProductImageRepository } from './product-image.repository';
import { ProductImageService } from './product-image.service';
import { ProductImageController } from './product-image.controller';
import { ProductSpecRepository } from './product-spec.repository';
import { StorageModule } from '../storage';
import { SearchModule } from '../search';
import { CategoryModule } from '../category';
import { BrandModule } from '../brand';
import { DeviceModule } from '../device';
import { AttributeDefinitionModule } from '../attribute-definition';
import { SlugRedirectModule } from '../slug-redirect';

@Module({
  // DeviceModule supplies DeviceRepository for validating device-compat ids
  // before writing the join rows (TASK-190).
  imports: [
    StorageModule,
    SearchModule,
    CategoryModule,
    BrandModule,
    DeviceModule,
    AttributeDefinitionModule,
    SlugRedirectModule,
  ],
  controllers: [ProductController, ProductImageController],
  providers: [
    ProductRepository,
    ProductDeviceCompatRepository,
    ProductService,
    ProductImageRepository,
    ProductImageService,
    ProductSpecRepository,
  ],
  // ProductRepository is exported (mirroring CategoryModule) so AddonServiceModule
  // can look up a product's `categoryId` when resolving its applicable add-ons
  // (TASK-174), without re-providing a second instance.
  exports: [ProductService, ProductRepository],
})
export class ProductModule {}
