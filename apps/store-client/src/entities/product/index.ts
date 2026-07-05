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
} from "@/shared/api/generated/models";

export {
  useProductControllerFindAll,
  getProductControllerFindAllQueryKey,
  useProductControllerFindBySlug,
  getProductControllerFindBySlugQueryKey,
  useProductControllerGetCards,
  getProductControllerGetCardsQueryKey,
} from "@/shared/api/generated/products/products";
