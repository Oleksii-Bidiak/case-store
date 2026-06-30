import { ApiProperty } from '@nestjs/swagger';
import { ReviewEntity } from './review.entity';
import type { ReviewModerationRow } from '../review.repository';

/**
 * Moderation-queue projection of a review. Extends {@link ReviewEntity} with the
 * author email and product name so the admin table can render rows without
 * extra client lookups.
 */
export class AdminReviewEntity extends ReviewEntity {
  @ApiProperty({ description: 'Author email address', example: 'olena@example.com' })
  userEmail!: string;

  @ApiProperty({ description: 'Reviewed product name', example: 'iPhone 15 Pro Case' })
  productName!: string;

  /**
   * Build an AdminReviewEntity from an enriched moderation row (review joined
   * with its user and product). `verifiedPurchase` is not relevant in the
   * moderation context and defaults to false.
   */
  static fromModerationRow(row: ReviewModerationRow): AdminReviewEntity {
    const entity = new AdminReviewEntity();
    entity.id = row.id;
    entity.userId = row.userId;
    entity.productId = row.productId;
    entity.rating = row.rating;
    entity.comment = row.comment;
    entity.verifiedPurchase = false;
    entity.isActive = row.isActive;
    entity.createdAt = row.createdAt;
    entity.userEmail = row.user.email;
    entity.productName = row.product.name;
    return entity;
  }
}
