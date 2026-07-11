// Add-on Service Module — public API (TASK-174)
export { AddonServiceModule } from './addon-service.module';
export { AddonServiceService } from './addon-service.service';
export { AddonServiceController } from './addon-service.controller';
export { AdminAddonServiceController } from './admin-addon-service.controller';
export { AddonApplicabilityResolver } from './addon-applicability.resolver';
export {
  AddonServiceRepository,
  FindAllAdminParams as AddonServiceFindAllAdminParams,
  CreateAddonServiceInput,
  UpdateAddonServiceInput,
  PaginatedAddonServicesResult,
  AddonServiceDeltaRow,
} from './addon-service.repository';
export {
  AddonServiceEntity,
  ResolvedAddonEntity,
  AddonServiceDeltaEntity,
  ResolvedCategoryTemplateEntity,
} from './entities';
export {
  CreateAddonServiceDto,
  UpdateAddonServiceDto,
  UpdateAddonServiceStatusDto,
  AddonServiceListQueryDto,
  SetCategoryTemplateDto,
  SetProductDeltaDto,
} from './dto';
export type {
  AddonSource,
  ResolvedAddon,
  ResolvableProduct,
  ResolvedCategoryTemplate,
  CategoryTemplateSource,
} from './addon-service.types';
export { toTwoDecimals, toCents, centsToString } from './money.util';
