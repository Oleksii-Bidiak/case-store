// Product entity — re-exports generated types and API hooks (FSD entities layer).
// Upper layers (widgets/features) import product data access from here, not from
// the generated client directly.
export type {
  ProductEntity,
  ProductListResponseEnvelope,
  ProductControllerFindAllParams,
  ProductControllerGetCardsParams,
  ProductCardsResponseEnvelope,
  ProductDetailResponseEnvelope,
  ProductCategoryEntity,
  ProductGroupEntity,
  ProductGroupAxisEntity,
  ProductSiblingEntity,
  ProductImageEntity,
  // Structured specs (TASK-191)
  ProductSpecEntity,
  FilterableSpecEntity,
} from "@/shared/api/generated/models";

// Runtime enum for spec value type (BOOLEAN formatting on the PDP).
export { ProductSpecEntityType } from "@/shared/api/generated/models";

export {
  useProductControllerFindAll,
  getProductControllerFindAllQueryKey,
  // Query options for parallel fetches (`useQueries` in the catalog load-more
  // append, TASK-216) — still the generated client, not a manual fetch.
  getProductControllerFindAllQueryOptions,
  useProductControllerFindBySlug,
  getProductControllerFindBySlugQueryKey,
  useProductControllerGetCards,
  getProductControllerGetCardsQueryKey,
} from "@/shared/api/generated/products/products";
