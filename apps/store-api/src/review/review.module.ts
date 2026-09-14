import { Module } from '@nestjs/common';
import { ReviewRepository } from './review.repository';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';
import { ReviewUpdateController } from './review-update.controller';
import { AdminReviewController } from './admin-review.controller';

/**
 * ReviewModule — product reviews (public submission/list, the author's own edit,
 * and admin moderation).
 *
 * Registers all three controllers and the service/repository providers. The
 * service is consumed only within this module, so nothing is exported.
 * `ReviewUpdateController` is mounted at a flat `reviews` prefix rather than
 * under the product — see its docblock for why the review id alone addresses it.
 */
@Module({
  controllers: [ReviewController, ReviewUpdateController, AdminReviewController],
  providers: [ReviewRepository, ReviewService],
})
export class ReviewModule {}
