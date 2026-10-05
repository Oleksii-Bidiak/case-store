// Brand Module — public API
export { BrandModule } from './brand.module';
export { BrandService } from './brand.service';
export { BrandController } from './brand.controller';
export { AdminBrandController } from './admin-brand.controller';
export {
  BrandRepository,
  type FindAllAdminParams as BrandFindAllAdminParams,
  type CreateBrandInput,
  type UpdateBrandInput,
  type PaginatedBrandsResult,
  type BrandWithProductCount,
} from './brand.repository';
export { BrandEntity } from './entities';
export {
  CreateBrandDto,
  UpdateBrandDto,
  BrandListQueryDto,
  PublicBrandListQueryDto,
  UpdateBrandStatusDto,
} from './dto';
