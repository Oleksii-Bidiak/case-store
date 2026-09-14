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
 * Registers all three controllers and the service/repository providers.
 * `ReviewUpdateController` is mounted at a flat `reviews` prefix rather than
 * under the product — see its docblock for why the review id alone addresses it.
 *
 * `ReviewService` is exported since TASK-589, for `UserModule`: banning an
 * account must also withdraw what it wrote, and un-banning must give it back.
 * The SERVICE and not the repository, following how `AuthModule` serves
 * `UserModule` — the caller gets the rule (a restore re-asks the email gate),
 * not a pair of raw writes it would have to remember to pair correctly.
 */
@Module({
  controllers: [ReviewController, ReviewUpdateController, AdminReviewController],
  providers: [ReviewRepository, ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
