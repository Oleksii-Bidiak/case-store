// Review entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated reviews client from the shared layer so the
// rest of the app depends on `@/entities/review` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminReviewControllerList,
  useAdminReviewControllerApprove,
  useAdminReviewControllerReject,
  // Bulk approve / reject over the on-screen selection (TASK-356)
  useAdminReviewControllerModerateMany,
  // TASK-446 — the shop's public reply (`reviews:write`) and withdrawing one
  // account's entire contribution (`reviews:moderate`).
  useAdminReviewControllerReply,
  useAdminReviewControllerHideAuthor,
  useAdminReviewControllerUnhideAuthor,
  getAdminReviewControllerListQueryKey,
  AdminReviewControllerListStatus,
  // The TEXT's three-value verdict. A value export, not just a type: the table
  // and the customer card both switch on it.
  AdminReviewEntityTextStatus,
  CustomerCardReviewEntityTextStatus,
} from "@/shared/api";

export type {
  AdminReviewEntity,
  ReviewAggregateEntity,
  ReviewReplyEntity,
  CreateReviewReplyDto,
  AdminReviewControllerListParams,
  AdminReviewListResponseEnvelope,
} from "@/shared/api";
