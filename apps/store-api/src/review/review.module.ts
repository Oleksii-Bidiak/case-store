import { Module } from '@nestjs/common';
import { ReviewRepository } from './review.repository';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';
import { AdminReviewController } from './admin-review.controller';

/**
 * ReviewModule — product reviews (public submission/list + admin moderation).
 *
 * Registers both controllers and the service/repository providers. The service
 * is consumed only within this module, so nothing is exported.
 */
@Module({
  controllers: [ReviewController, AdminReviewController],
  providers: [ReviewRepository, ReviewService],
})
export class ReviewModule {}
