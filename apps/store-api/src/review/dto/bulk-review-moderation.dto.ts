import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsUUID } from 'class-validator';
import { MAX_REORDER_IDS } from '../../common/dto';

/**
 * What a bulk moderation call does to the named reviews.
 *
 * `reject` is spelled out rather than modelled as `isActive: false` on purpose:
 * rejecting a review HARD-DELETES it (it frees the unique `(userId, productId)`
 * slot so the author can submit again), so it is not the inverse of approve and
 * must not read like one. A boolean flag here would have made an irreversible
 * action look like a toggle.
 */
export const REVIEW_BULK_ACTIONS = ['approve', 'reject'] as const;
export type ReviewBulkAction = (typeof REVIEW_BULK_ACTIONS)[number];

/**
 * Body of `PATCH /api/admin/reviews/moderate` (TASK-356).
 */
export class BulkReviewModerationDto {
  @ApiProperty({ description: 'Ids of the reviews being moderated.', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_REORDER_IDS)
  @IsUUID('4', { each: true })
  ids!: string[];

  @ApiProperty({
    description:
      '`approve` publishes the reviews to the storefront. `reject` DELETES them permanently.',
    enum: REVIEW_BULK_ACTIONS,
  })
  @IsIn(REVIEW_BULK_ACTIONS)
  action!: ReviewBulkAction;
}
