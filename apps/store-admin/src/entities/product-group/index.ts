// Product group entity — domain types, API hooks, and query-key getters (TASK-142).
// Re-exports the Orval-generated product-group client from the shared layer so
// the rest of the app depends on `@/entities/product-group` rather than reaching
// into `@/shared/api` directly.

export {
  useProductGroupControllerFindAll,
  useProductGroupControllerFindById,
  useProductGroupControllerCreate,
  useProductGroupControllerUpdate,
  getProductGroupControllerFindAllQueryKey,
  getProductGroupControllerFindByIdQueryKey,
} from "@/shared/api";

export type {
  ProductGroupSummaryEntity,
  ProductGroupDetailEntity,
  ProductGroupAxisEntity,
  ProductGroupAxisInputDto,
  ProductSiblingEntity,
  CreateProductGroupDto,
  UpdateProductGroupDto,
  ProductGroupListResponse,
  ProductGroupResponseEnvelope,
} from "@/shared/api";
