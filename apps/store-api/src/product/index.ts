// Product Module — public API
export { ProductModule } from './product.module';
export { ProductService } from './product.service';
export { ProductController } from './product.controller';
export {
  ProductRepository,
  CreateProductInput,
  UpdateProductInput,
  FindAllParams,
  PaginatedProductsResult,
  ProductWithRelations,
} from './product.repository';
export { ProductEntity } from './entities';
export { CreateProductDto, UpdateProductDto, ProductListQueryDto } from './dto';
