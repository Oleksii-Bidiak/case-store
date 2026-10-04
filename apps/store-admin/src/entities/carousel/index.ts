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
  // Wave 198 (TASK-1074): the PUBLIC list — published carousels with the
  // products the site resolved for them. The form shows it as «Зараз на сайті».
  useCarouselControllerFindAll,
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

// Wave 198 (TASK-1074): «Дублювати» on the existing create + set-items API.
export {
  duplicateCarouselPayload,
  useDuplicateCarousel,
} from "./model/use-duplicate-carousel";
