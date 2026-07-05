// Brand Module — public API
export { BrandModule } from './brand.module';
export { BrandService } from './brand.service';
export { BrandController } from './brand.controller';
export { AdminBrandController } from './admin-brand.controller';
export {
  BrandRepository,
  FindAllAdminParams as BrandFindAllAdminParams,
  CreateBrandInput,
  UpdateBrandInput,
  PaginatedBrandsResult,
} from './brand.repository';
export { BrandEntity } from './entities';
export { CreateBrandDto, UpdateBrandDto, BrandListQueryDto, UpdateBrandStatusDto } from './dto';
