// Review entity — re-exports generated types and API hooks (FSD entities layer).
// Upper layers (widgets/features) import review data access from here, not from
// the generated client directly.
export type {
  ReviewEntity,
  ReviewAggregateEntity,
  ReviewListResponseEnvelope,
  ReviewControllerListParams,
  CreateReviewDto,
} from "@/shared/api/generated/models";

export {
  useReviewControllerList,
  getReviewControllerListQueryKey,
  useReviewControllerSubmit,
} from "@/shared/api/generated/reviews/reviews";
