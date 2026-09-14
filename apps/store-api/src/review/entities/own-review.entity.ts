import { ApiProperty } from '@nestjs/swagger';
import { Review, ReviewTextStatus } from '@prisma/client';

/**
 * The author's view of their OWN review (TASK-586).
 *
 * A third projection alongside {@link import('./review.entity').ReviewEntity}
 * (what any visitor may read) and
 * {@link import('./admin-review.entity').AdminReviewEntity} (what a moderator
 * needs). It exists because the author sits between the two: they may see more
 * than a stranger and less than a moderator, and folding either of the existing
 * entities into that role would have leaked in one direction or blinded them in
 * the other.
 *
 * WHAT IT CARRIES AND WHY:
 *  - `textStatus` — yes. «На модерації» and «Відхилено» are the two things the
 *    author needs told; withholding them leaves someone re-submitting into a
 *    queue they cannot see, or waiting forever on a verdict that already came.
 *    This is NOT the `isActive` leak TASK-585 removed: that put moderation state
 *    on the PUBLIC entity, where every reader of every review could see it.
 *  - `hiddenAt` — no. It is the moderator's account-wide lever, and an author who
 *    can read it can confirm they have been hidden and simply open a new account.
 *  - `createdIp` — no. It is theirs, but it is kept for the abuse signals the
 *    owner asked for, and an endpoint that echoes it back is one more place it
 *    can leak from.
 *  - `verifiedPurchase` — no. It is a badge for OTHER people reading the review;
 *    the author already knows whether they bought the thing.
 */
export class OwnReviewEntity {
  @ApiProperty({
    description: 'Review unique identifier — the id to PATCH when adding text',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Reviewed product id',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  productId!: string;

  @ApiProperty({ description: 'Star rating from 1 to 5 — immutable once given', example: 5 })
  rating!: number;

  @ApiProperty({
    description: 'The author’s own text; null when they left a rating only',
    type: String,
    nullable: true,
    required: false,
    example: 'Great quality, fast shipping.',
  })
  comment!: string | null;

  @ApiProperty({
    description: 'Moderation verdict on the author’s own text',
    enum: ReviewTextStatus,
    example: ReviewTextStatus.PENDING,
  })
  textStatus!: ReviewTextStatus;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-06-30T00:00:00.000Z' })
  createdAt!: Date;

  static fromPrisma(review: Review): OwnReviewEntity {
    const entity = new OwnReviewEntity();
    entity.id = review.id;
    entity.productId = review.productId;
    entity.rating = review.rating;
    entity.comment = review.comment;
    entity.textStatus = review.textStatus;
    entity.createdAt = review.createdAt;
    return entity;
  }
}
