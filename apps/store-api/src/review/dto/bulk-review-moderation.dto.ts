import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsUUID } from 'class-validator';
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
  // A repeated id would be rejected as if it did not exist: the repository's
  // all-or-nothing check compares found-vs-asked counts, and Prisma's `id: { in: }`
  // collapses duplicates, so `[X, X]` aborts the batch with a 404 that names no
  // ids at all. It matters more here than elsewhere — this endpoint deletes, and
  // an operator who is told "not found" about a review that plainly exists has no
  // way to tell whether anything was removed.
  @ArrayUnique({ message: 'ids must not contain duplicates' })
  @IsUUID('all', { each: true })
  ids!: string[];

  @ApiProperty({
    description:
      '`approve` publishes the reviews to the storefront. `reject` DELETES them permanently.',
    enum: REVIEW_BULK_ACTIONS,
  })
  @IsIn(REVIEW_BULK_ACTIONS)
  action!: ReviewBulkAction;
}
