// Product entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated product client from the shared layer so the
// rest of the app depends on `@/entities/product` rather than reaching into
// `@/shared/api` directly.

export {
  // TASK-230: the admin panel lists via the guarded admin endpoint (all
  // statuses, no cache) — the public list is active-only and not used here.
  useProductControllerAdminFindAll,
  useProductControllerFindById,
  useProductControllerCreate,
  useProductControllerUpdate,
  useProductControllerDeactivate,
  useProductControllerActivate,
  useProductControllerPreviewProductBySlug,
  // Structured specs (TASK-191)
  useUpdateProductSpecs,
  getProductControllerAdminFindAllQueryKey,
  getProductControllerFindByIdQueryKey,
  // Product images (TASK-073)
  useProductImageControllerList,
  useProductImageControllerUpload,
  useProductImageControllerReorder,
  useProductImageControllerDelete,
  getProductImageControllerListQueryKey,
} from "@/shared/api";

export type {
  ProductEntity,
  CreateProductDto,
  UpdateProductDto,
  ProductControllerAdminFindAllParams,
  ProductListResponseEnvelope,
  ProductResponseEnvelope,
  AdminProductPreviewResponseEnvelope,
  ProductCategoryEntity,
  ProductGroupEntity,
  ProductSiblingEntity,
  // Structured specs (TASK-191)
  ProductSpecEntity,
  UpdateProductSpecsDto,
  ProductSpecValueDto,
  // Product images (TASK-073)
  ProductImageEntity,
  ProductImageListEnvelope,
  ProductImageControllerUploadBody,
  ReorderImagesDto,
  ReorderImageDto,
} from "@/shared/api";
