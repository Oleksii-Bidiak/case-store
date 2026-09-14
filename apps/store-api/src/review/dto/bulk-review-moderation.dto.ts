import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsUUID } from 'class-validator';
import { MAX_REORDER_IDS } from '../../common/dto';

/**
 * What a bulk moderation call does to the named reviews' TEXTS.
 *
 * Spelled out as named actions rather than a boolean because the text has THREE
 * states (TASK-585): `approve` writes APPROVED, `reject` writes REJECTED, and
 * `PENDING` is where a text starts and where no action returns it. A flag would
 * have to pretend the third state does not exist.
 *
 * Neither action deletes anything any more, and neither touches the rating.
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
  // ids at all — an operator told "not found" about a review that is plainly on
  // their screen has nothing to act on.
  @ArrayUnique({ message: 'ids must not contain duplicates' })
  @IsUUID('loose', { each: true })
  ids!: string[];

  @ApiProperty({
    description:
      '`approve` publishes the review texts to the storefront; `reject` withholds them. ' +
      'Neither deletes anything, and neither changes the ratings.',
    enum: REVIEW_BULK_ACTIONS,
  })
  @IsIn(REVIEW_BULK_ACTIONS)
  action!: ReviewBulkAction;
}
