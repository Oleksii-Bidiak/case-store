// Product entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated product client from the shared layer so the
// rest of the app depends on `@/entities/product` rather than reaching into
// `@/shared/api` directly.

export {
  // TASK-230: the admin panel lists via the guarded admin endpoint (all
  // statuses, no cache) — the public list is active-only and not used here.
  useProductControllerAdminFindAll,
  // Wave 198 (TASK-1073): the PUBLIC, active-only list — on purpose, for the
  // banner LinkPicker. A link may only point at a product the shop shows, and
  // the endpoint needs no `products:read`, which a content manager lacks.
  useProductControllerFindAll,
  useProductControllerFindById,
  useProductControllerCreate,
  useProductControllerUpdate,
  useProductControllerDeactivate,
  useProductControllerActivate,
  // TASK-427: the soft-delete mutation. Generated since TASK-140 and never
  // re-exported, which is the whole reason nothing in the panel could reach
  // DELETE /api/products/:id — the endpoint, its permission and its tombstone
  // logic were all in place, and the button was missing one export line.
  useDeleteProduct,
  // TASK-656: bring a soft-deleted product back, hidden.
  useRestoreProduct,
  // Bulk activate / deactivate over the on-screen selection (TASK-355)
  useProductControllerSetStatusMany,
  useProductControllerPreviewProductBySlug,
  // Structured specs (TASK-191)
  useUpdateProductSpecs,
  getProductControllerAdminFindAllQueryKey,
  getProductControllerFindByIdQueryKey,
  // Product images (TASK-073)
  useProductImageControllerList,
  useProductImageControllerUpload,
  // TASK-441 — attach a picture that is already in the media library, instead
  // of uploading the same file a second time.
  useProductImageControllerAttach,
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
  // TASK-656
  RestoreProductDto,
} from "@/shared/api";

// TASK-656: a deleted product's native slug / артикул, without `deleted:<id>:`.
export { stripTombstonePrefix, tombstonePrefix } from "./lib/tombstone";
