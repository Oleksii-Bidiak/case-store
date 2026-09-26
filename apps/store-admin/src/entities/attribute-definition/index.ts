// Attribute-definition entity (TASK-191) — domain types, API hooks, and
// query-key getters. Re-exports the Orval-generated attribute-definition client
// from the shared layer so features depend on `@/entities/attribute-definition`
// rather than reaching into `@/shared/api` directly.

export {
  useAttributeDefinitionControllerFindByCategory,
  useAttributeDefinitionControllerFindEffective,
  useAttributeDefinitionControllerCreate,
  useAttributeDefinitionControllerUpdate,
  useAttributeDefinitionControllerDelete,
  useAttributeDefinitionControllerReorder,
  getAttributeDefinitionControllerFindByCategoryQueryKey,
  // TASK-707 — categories of a subtree over the storefront facet ceiling.
  useAttributeDefinitionControllerFacetCeiling,
  getAttributeDefinitionControllerFacetCeilingQueryKey,
} from "@/shared/api";

export {
  AttributeDefinitionEntityType,
  CreateAttributeDefinitionDtoType,
} from "@/shared/api";

export type {
  AttributeDefinitionEntity,
  CreateAttributeDefinitionDto,
  UpdateAttributeDefinitionDto,
  ReorderAttributeDefinitionsDto,
  AttributeDefinitionResponse,
  AttributeDefinitionListResponse,
  FacetCeilingReportEntity,
  FacetCeilingCategoryEntity,
} from "@/shared/api";
