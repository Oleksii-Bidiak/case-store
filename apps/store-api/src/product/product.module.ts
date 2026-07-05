import { Module } from '@nestjs/common';
import { ProductRepository } from './product.repository';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ProductImageRepository } from './product-image.repository';
import { ProductImageService } from './product-image.service';
import { ProductImageController } from './product-image.controller';
import { StorageModule } from '../storage';
import { SearchModule } from '../search';
import { CategoryModule } from '../category';

@Module({
  imports: [StorageModule, SearchModule, CategoryModule],
  controllers: [ProductController, ProductImageController],
  providers: [ProductRepository, ProductService, ProductImageRepository, ProductImageService],
  exports: [ProductService],
})
export class ProductModule {}
