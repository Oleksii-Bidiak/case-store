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
} from "@/shared/api";
