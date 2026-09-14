import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Longest review text we accept — for the same column, on both ways in.
 *
 * Shared with {@link import('./update-review.dto').UpdateReviewDto} rather than
 * written twice (TASK-586), because the two caps are not independent decisions:
 * if the edit's cap were the smaller one, an author could submit a text and then
 * be unable to touch it — the form would refuse the very words the server had
 * already accepted, and the only way out would be to erase them. Drift in the
 * other direction is quieter still: an edit stores more than a submission can.
 */
export const REVIEW_COMMENT_MAX_LENGTH = 1000;

/**
 * Request body for submitting a product review. The author is taken from the
 * JWT (`@CurrentUser('id')`), never the body, so there is no `userId` field.
 */
export class CreateReviewDto {
  @ApiProperty({ description: 'Star rating from 1 to 5', minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({
    description: `Optional free-text comment (max ${REVIEW_COMMENT_MAX_LENGTH} chars)`,
    required: false,
    maxLength: REVIEW_COMMENT_MAX_LENGTH,
    example: 'Excellent case, fits perfectly and feels premium.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(REVIEW_COMMENT_MAX_LENGTH)
  comment?: string;
}
