// Product entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated product client from the shared layer so the
// rest of the app depends on `@/entities/product` rather than reaching into
// `@/shared/api` directly.

export {
  useProductControllerFindAll,
  useProductControllerFindById,
  useProductControllerCreate,
  useProductControllerUpdate,
  useProductControllerDeactivate,
  useProductControllerActivate,
  getProductControllerFindAllQueryKey,
  getProductControllerFindByIdQueryKey,
} from "@/shared/api";

export type {
  ProductEntity,
  CreateProductDto,
  UpdateProductDto,
  ProductControllerFindAllParams,
  ProductListResponseEnvelope,
  ProductResponseEnvelope,
} from "@/shared/api";
