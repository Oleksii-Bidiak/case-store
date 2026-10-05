// Add-on Service Module — public API (TASK-174)
export { AddonServiceModule } from './addon-service.module';
export { AddonServiceService, ADDON_SERVICES_TAG } from './addon-service.service';
export { AddonApplicabilityResolver } from './addon-applicability.resolver';
export {
  AddonServiceRepository,
  type FindAllAdminParams as AddonServiceFindAllAdminParams,
  type CreateAddonServiceInput,
  type UpdateAddonServiceInput,
  type PaginatedAddonServicesResult,
  type AddonServiceDeltaRow,
} from './addon-service.repository';
export {
  AddonServiceEntity,
  PublicAddonServiceEntity,
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
export { toTwoDecimals, toCents, centsToString, lineTotalCents, sumLineCents } from './money.util';
