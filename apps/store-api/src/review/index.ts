// Review Module — public API
export { ReviewModule } from './review.module';
export { ReviewService } from './review.service';
// The review predicates other modules count with (the dashboard's moderation
// queue, the product rating). `ProductRepository` still imports them from the
// leaf file: this barrel leads back to it (see the cycle note there, TASK-818).
export {
  COUNTS_TOWARD_RATING,
  AUTHOR_NOT_HIDDEN,
  HAS_TEXT_TO_MODERATE,
  moderationQueueWhere,
  authorVisibilityWhere,
  type AuthorVisibilityFilter,
} from './review.constants';
export {
  ReviewEntity,
  ReviewAggregateEntity,
  AdminReviewEntity,
  OwnReviewEntity,
  ReviewReplyEntity,
} from './entities';
export {
  CreateReviewDto,
  UpdateReviewDto,
  CreateReviewReplyDto,
  ReviewListQueryDto,
  AdminReviewQueryDto,
  ReviewModerationStatus,
} from './dto';
