// Carousel entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated carousel client from the shared layer so the
// rest of the app depends on `@/entities/carousel` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminCarouselControllerFindAll,
  useAdminCarouselControllerFindById,
  useAdminCarouselControllerCreate,
  useAdminCarouselControllerUpdate,
  useAdminCarouselControllerPublish,
  useAdminCarouselControllerUnpublish,
  useAdminCarouselControllerDelete,
  useAdminCarouselControllerGetItems,
  useAdminCarouselControllerSetItems,
  getAdminCarouselControllerFindAllQueryKey,
  getAdminCarouselControllerFindByIdQueryKey,
  getAdminCarouselControllerGetItemsQueryKey,
} from "@/shared/api";

export type {
  CarouselEntity,
  CarouselItemEntity,
  PublicCarouselEntity,
  CreateCarouselDto,
  UpdateCarouselDto,
  SetCarouselItemDto,
  SetCarouselItemsDto,
  AdminCarouselControllerFindAllParams,
  AdminCarouselListResponse,
  CarouselItemListResponse,
} from "@/shared/api";

export { CarouselEntitySource, CarouselEntityPlacement } from "@/shared/api";
