// Review entity — re-exports generated types and API hooks (FSD entities layer).
// Upper layers (widgets/features) import review data access from here, not from
// the generated client directly.
export type {
  ReviewEntity,
  ReviewReplyEntity,
  ReviewAggregateEntity,
  ReviewPaginationMeta,
  ReviewListResponseEnvelope,
  ReviewControllerListParams,
  CreateReviewDto,
  OwnReviewEntity,
  OwnReviewResponseEnvelope,
  UpdateReviewDto,
} from "@/shared/api/generated/models";

// `OwnReviewEntityTextStatus` is exported as a VALUE as well as a type: it is
// the generated const object, and the storefront compares against its members
// rather than against bare "PENDING"/"REJECTED" string literals.
export { OwnReviewEntityTextStatus } from "@/shared/api/generated/models";

export {
  useReviewControllerList,
  getReviewControllerListQueryKey,
  useReviewControllerSubmit,
  useReviewControllerMine,
  getReviewControllerMineQueryKey,
  useReviewControllerUpdate,
} from "@/shared/api/generated/reviews/reviews";
