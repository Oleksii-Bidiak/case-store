// Homepage block entity (plan 186, TASK-664) — the Orval-generated home-block
// client re-exported from the shared layer, plus «where does carousel X stand»
// helpers. The carousel list and form read it today; the «Головна» screen
// (TASK-662) builds on the same slice.

export {
  useAdminHomeBlockControllerFindAll,
  useAdminHomeBlockControllerFindById,
  useAdminHomeBlockControllerCreate,
  useAdminHomeBlockControllerUpdate,
  useAdminHomeBlockControllerDelete,
  useAdminHomeBlockControllerPublish,
  useAdminHomeBlockControllerUnpublish,
  useAdminHomeBlockControllerReorder,
  getAdminHomeBlockControllerFindAllQueryKey,
  getAdminHomeBlockControllerFindByIdQueryKey,
} from "@/shared/api";

export type {
  HomeBlockEntity,
  HomeBlockTabEntity,
  HomeBlockCarouselSummaryEntity,
  AdminHomeBlockListResponse,
  CreateHomeBlockDto,
  UpdateHomeBlockDto,
  ReorderHomeBlocksDto,
} from "@/shared/api";

export { HomeBlockType, HomeBlockEntityStatus } from "@/shared/api";

export {
  carouselHomePlacements,
  describeHomePlacement,
  homeBlockLabel,
  homePlacementsByCarousel,
  sortHomeBlocks,
  type CarouselHomePlacement,
} from "./model/home-placement";
