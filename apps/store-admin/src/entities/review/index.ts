// Review entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated reviews client from the shared layer so the
// rest of the app depends on `@/entities/review` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminReviewControllerList,
  useAdminReviewControllerApprove,
  useAdminReviewControllerReject,
  getAdminReviewControllerListQueryKey,
  AdminReviewControllerListStatus,
} from "@/shared/api";

export type {
  AdminReviewEntity,
  ReviewAggregateEntity,
  AdminReviewControllerListParams,
  AdminReviewListResponseEnvelope,
} from "@/shared/api";
