import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FailClosedThrottle } from '../throttler';
import { ReviewService } from './review.service';
import { OwnReviewEntity } from './entities';
import { UpdateReviewDto } from './dto';
import { JwtAuthGuard, CurrentUser } from '../auth';

/**
 * Response envelope for an edited review, in the author's own projection.
 */
class UpdatedReviewResponseEnvelope {
  @ApiProperty({ type: OwnReviewEntity })
  data!: OwnReviewEntity;
}

/**
 * `PATCH /api/reviews/:id` — the author adds or changes the text beside a rating
 * they already left (TASK-586, owner's decision 5 of 2026-09-10).
 *
 * WHY A SECOND CONTROLLER. The route is flat by design: a review id is globally
 * unique, so `products/:productId/reviews/:id` would carry a product id the
 * server does not need and must then either ignore (a lie in the URL) or verify
 * (a second lookup that can only ever restate what the review row already says).
 * Nest binds one path prefix per controller, so a flat route needs its own class
 * — the same reason `AdminReviewController` is separate, one level up.
 *
 * It lives in {@link import('./review.module').ReviewModule} alongside the other
 * two: same service, same repository, different mount point.
 */
@ApiTags('Reviews')
@ApiExtraModels(OwnReviewEntity, UpdatedReviewResponseEnvelope)
@Controller('reviews')
export class ReviewUpdateController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * PATCH /api/reviews/:id
   *
   * Writes the author's text and sends it back to moderation. The rating is
   * immutable and is not in {@link UpdateReviewDto} at all — an attempt to change
   * it is refused by the global pipe's `forbidNonWhitelisted`, not ignored.
   *
   * A review that is not the caller's — or whose author a moderator has hidden —
   * answers 404, never 403. 403 would confirm the row exists and make this route
   * an id oracle; the authorship check therefore lives in the repository's WHERE
   * clause, so "not yours" and "not there" are genuinely the same query result.
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  // Same cap as submission: an edit re-queues the text for moderation, so an
  // uncapped PATCH floods the same backlog an uncapped POST would — and does it
  // from a single row, which `@@unique([userId, productId])` cannot bound.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  // Authenticated, but one throwaway account with no working limiter is enough
  // to bury the queue (TASK-401).
  @FailClosedThrottle()
  @ApiOperation({
    summary: 'Add or change the text on your own review',
    operationId: 'reviewControllerUpdate',
  })
  @ApiParam({ name: 'id', description: 'Review UUID' })
  @ApiResponse({
    status: 200,
    description: 'Text saved; it is back in the moderation queue',
    type: UpdatedReviewResponseEnvelope,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error — text too long, or an attempt to change the rating',
  })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 404, description: 'No such review of yours' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ): Promise<UpdatedReviewResponseEnvelope> {
    const review = await this.reviewService.updateOwnReview(userId, id, dto);
    return { data: review };
  }
}
