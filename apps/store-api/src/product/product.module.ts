import { Module } from '@nestjs/common';
import { ProductRepository } from './product.repository';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ProductImageRepository } from './product-image.repository';
import { ProductImageService } from './product-image.service';
import { ProductImageController } from './product-image.controller';
import { ProductSpecRepository } from './product-spec.repository';
import { StorageModule } from '../storage';
import { SearchModule } from '../search';
import { CategoryModule } from '../category';
import { AttributeDefinitionModule } from '../attribute-definition';

@Module({
  imports: [StorageModule, SearchModule, CategoryModule, AttributeDefinitionModule],
  controllers: [ProductController, ProductImageController],
  providers: [
    ProductRepository,
    ProductService,
    ProductImageRepository,
    ProductImageService,
    ProductSpecRepository,
  ],
  exports: [ProductService],
})
export class ProductModule {}
