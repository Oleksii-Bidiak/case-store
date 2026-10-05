// Product Module — public API
export { ProductModule } from './product.module';
export { ProductService } from './product.service';
export { ProductController } from './product.controller';
export {
  ProductRepository,
  type CreateProductInput,
  type UpdateProductInput,
  type FindAllParams,
  type PaginatedProductsResult,
  type ProductWithRelations,
} from './product.repository';
export { ProductEntity } from './entities';
export { CreateProductDto, UpdateProductDto, ProductListQueryDto } from './dto';
