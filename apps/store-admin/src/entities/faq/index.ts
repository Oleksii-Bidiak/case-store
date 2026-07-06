// FAQ entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated faq client from the shared layer so the rest of
// the app depends on `@/entities/faq` rather than reaching into `@/shared/api`
// directly.

export {
  useAdminFaqControllerFindAll,
  useAdminFaqControllerFindById,
  useAdminFaqControllerCreate,
  useAdminFaqControllerUpdate,
  useAdminFaqControllerRemove,
  getAdminFaqControllerFindAllQueryKey,
  getAdminFaqControllerFindByIdQueryKey,
} from "@/shared/api";

export type {
  FaqItemEntity,
  CreateFaqItemDto,
  UpdateFaqItemDto,
  FaqListResponse,
  FaqItemResponseEnvelope,
} from "@/shared/api";
