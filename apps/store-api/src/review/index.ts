// Review Module — public API
export { ReviewModule } from './review.module';
export { ReviewService } from './review.service';
export { ReviewController } from './review.controller';
export { AdminReviewController } from './admin-review.controller';
export { ReviewRepository } from './review.repository';
export type {
  CreateReviewInput,
  ReviewAggregateData,
  ReviewModerationRow,
  ReviewModerationFilter,
} from './review.repository';
// `review.constants` is deliberately NOT re-exported here. `ProductRepository`
// imports `COUNTS_TOWARD_RATING` from the leaf file directly (as it already does
// with `order.constants`); routing it through this barrel would drag the module,
// its controllers and its service into the product module's import graph.
export { ReviewEntity, ReviewAggregateEntity, AdminReviewEntity } from './entities';
export {
  CreateReviewDto,
  ReviewListQueryDto,
  AdminReviewQueryDto,
  ReviewModerationStatus,
} from './dto';
