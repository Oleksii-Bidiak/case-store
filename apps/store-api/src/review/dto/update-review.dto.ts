import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { REVIEW_COMMENT_MAX_LENGTH } from './create-review.dto';

/**
 * Body of `PATCH /api/reviews/:id` (TASK-586) — the author adding or changing the
 * text beside a rating they already left (owner's decision 5, 2026-09-10).
 *
 * THE RATING IS DELIBERATELY ABSENT, and its absence is the enforcement.
 * A rating is a one-shot act: you may say what you think of a product once, and
 * `@@unique([userId, productId])` is what makes that true. An editable rating
 * gives it back — rate five stars, watch the average move, edit down to one, and
 * repeat — which is the abuse surface this whole task exists to close, reopened
 * through a comment box.
 *
 * The attempt is REFUSED rather than ignored, and that distinction matters: the
 * global pipe runs `forbidNonWhitelisted: true` (main.ts), so a body carrying
 * `rating` gets a 400 naming the offending property. Silently dropping it would
 * answer 200 to someone who believes their new score landed.
 */
export class UpdateReviewDto {
  @ApiProperty({
    description:
      `The review text (max ${REVIEW_COMMENT_MAX_LENGTH} chars). Writing or changing it sends ` +
      'the text back to moderation. Omit the field entirely to leave the existing text — and ' +
      'its verdict — untouched.',
    required: false,
    maxLength: REVIEW_COMMENT_MAX_LENGTH,
    example: 'Came back a month later: still perfect.',
  })
  @IsOptional()
  @IsString()
  // The SAME cap as submission, deliberately — see REVIEW_COMMENT_MAX_LENGTH.
  @MaxLength(REVIEW_COMMENT_MAX_LENGTH)
  comment?: string;
}
