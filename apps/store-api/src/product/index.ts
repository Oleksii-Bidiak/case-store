// Product Module — public API
export { ProductModule } from './product.module';
export { ProductService } from './product.service';
export {
  ProductRepository,
  type CreateProductInput,
  type UpdateProductInput,
  type FindAllParams,
  type PaginatedProductsResult,
  type ProductWithRelations,
  type ProductIndexSource,
} from './product.repository';
export {
  ProductEntity,
  PublicProductEntity,
  ProductGroupAxisEntity,
  ProductSiblingEntity,
} from './entities';
export {
  CreateProductDto,
  UpdateProductDto,
  ProductListQueryDto,
  parseSpecFilters,
  serializeSpecFilters,
  MAX_SPEC_FACETS,
  type SpecFacetFilter,
} from './dto';
// What "publicly visible" and "matches the catalogue filters" mean. Every module
// that counts or lists products for the storefront (brands, categories, landing
// pages, reports, the wishlist) must ask THIS module rather than re-derive it.
export {
  PUBLIC_PRODUCT_WHERE,
  publicProductSql,
  type PublicProductSqlAliases,
} from './product-visibility';
export {
  buildProductListWhere,
  ON_SALE_PRODUCT_IDS_SQL,
  type ProductListWhereParams,
} from './product-list-where';
export { LOW_STOCK_THRESHOLD, MAX_DESCRIPTION_LENGTH } from './product.constants';
