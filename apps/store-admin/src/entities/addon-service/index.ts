// Add-on service entity (TASK-174) — domain types, API hooks, and query-key
// getters. Re-exports the Orval-generated add-on-service client from the shared
// layer so the rest of the app depends on `@/entities/addon-service` rather than
// reaching into `@/shared/api` directly.
//
// Three groups, matching the backend's three concerns:
//   - CATALOG   — CRUD over the AddonService rows themselves;
//   - TEMPLATES — which services a CATEGORY offers (inherited down the tree);
//   - DELTAS    — a PRODUCT's ADD / REMOVE / OVERRIDE exceptions to that.

export {
  // Catalog
  useAddonServiceControllerAdminFindAll,
  useAddonServiceControllerAdminFindActive,
  useAddonServiceControllerFindById,
  useAdminAddonServiceControllerCreate,
  useAdminAddonServiceControllerUpdate,
  useAdminAddonServiceControllerSetStatus,
  getAddonServiceControllerAdminFindAllQueryKey,
  getAddonServiceControllerAdminFindActiveQueryKey,
  getAddonServiceControllerFindByIdQueryKey,
  // Category templates
  useAddonServiceControllerGetCategoryTemplate,
  useAddonServiceControllerResolveCategoryTemplate,
  useAddonServiceControllerSetCategoryTemplate,
  getAddonServiceControllerGetCategoryTemplateQueryKey,
  getAddonServiceControllerResolveCategoryTemplateQueryKey,
  // Product deltas
  useAddonServiceControllerResolveForProduct,
  useAddonServiceControllerGetProductDeltas,
  useAddonServiceControllerSetProductDelta,
  useAddonServiceControllerClearProductDelta,
  getAddonServiceControllerResolveForProductQueryKey,
  getAddonServiceControllerGetProductDeltasQueryKey,
} from "@/shared/api";

export type {
  AddonServiceEntity,
  ResolvedAddonEntity,
  ResolvedAddonEntitySource,
  AddonServiceDeltaEntity,
  ResolvedCategoryTemplateEntity,
  CreateAddonServiceDto,
  UpdateAddonServiceDto,
  UpdateAddonServiceStatusDto,
  SetCategoryTemplateDto,
  SetProductDeltaDto,
  SetProductDeltaDtoType,
  AddonServiceControllerAdminFindAllParams,
  AdminAddonServiceListResponse,
} from "@/shared/api";
