// Brand entity — re-exports generated types and API hooks (FSD entities layer).
export type {
  BrandEntity,
  BrandListResponse,
} from "@/shared/api/generated/models";

export {
  useBrandControllerFindAll,
  getBrandControllerFindAllQueryKey,
} from "@/shared/api/generated/brands/brands";
