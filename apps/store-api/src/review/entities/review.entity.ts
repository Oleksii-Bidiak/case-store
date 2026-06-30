import { ApiProperty } from '@nestjs/swagger';
import { Review } from '@prisma/client';

/**
 * Domain entity representing a single product review exposed to clients.
 *
 * This is a clean domain entity — not the raw Prisma model. The
 * `verifiedPurchase` flag is computed by the service (it is not a column) and
 * indicates whether the author has an order line item for this product.
 */
export class ReviewEntity {
  @ApiProperty({
    description: 'Review unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Author user id',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  userId!: string;

  @ApiProperty({
    description: 'Reviewed product id',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  productId!: string;

  @ApiProperty({ description: 'Star rating from 1 to 5', example: 5 })
  rating!: number;

  @ApiProperty({
    description: 'Optional free-text comment',
    type: String,
    nullable: true,
    required: false,
    example: 'Great quality, fast shipping.',
  })
  comment!: string | null;

  @ApiProperty({
    description: 'Whether the author has purchased this product (badge signal)',
    example: true,
  })
  verifiedPurchase!: boolean;

  @ApiProperty({
    description: 'Whether the review is approved and visible on the storefront',
    example: false,
  })
  isActive!: boolean;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-06-30T00:00:00.000Z' })
  createdAt!: Date;

  /**
   * Build a ReviewEntity from a Prisma `Review` plus the computed
   * `verifiedPurchase` flag (defaults to false when not provided, e.g. on the
   * public list where no per-author purchase lookup is performed).
   */
  static fromPrisma(review: Review, verifiedPurchase = false): ReviewEntity {
    const entity = new ReviewEntity();
    entity.id = review.id;
    entity.userId = review.userId;
    entity.productId = review.productId;
    entity.rating = review.rating;
    entity.comment = review.comment;
    entity.verifiedPurchase = verifiedPurchase;
    entity.isActive = review.isActive;
    entity.createdAt = review.createdAt;
    return entity;
  }
}
