// Brand Module — public API
export { BrandModule } from './brand.module';
export { BrandService } from './brand.service';
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
