import { ApiProperty } from '@nestjs/swagger';
import { ReviewHiddenReason, ReviewTextStatus } from '@prisma/client';
import { ReviewEntity } from './review.entity';
import { ReviewReplyEntity } from './review-reply.entity';
import type { ReviewModerationRow } from '../review.repository';

/**
 * Moderation-queue projection of a review. Extends {@link ReviewEntity} with the
 * author email and product name so the admin table can render rows without
 * extra client lookups — and with the two moderation flags the public entity
 * deliberately no longer carries (TASK-585).
 */
export class AdminReviewEntity extends ReviewEntity {
  /**
   * The TEXT's verdict. Three values, not a boolean, because `REJECTED` is now a
   * state a row keeps: a moderator has to be able to tell «ще не читали» from
   * «прочитали й відхилили», which is exactly the distinction the old `isActive`
   * could not express — it hard-deleted the second case out of existence.
   */
  @ApiProperty({
    description: 'Moderation verdict on the review text',
    enum: ReviewTextStatus,
    example: ReviewTextStatus.PENDING,
  })
  textStatus!: ReviewTextStatus;

  /**
   * Whether this rating is counting toward the product's score right now.
   *
   * Shown beside the verdict because the two are independent and a moderator
   * acting on one needs to see the other: a text can be approved while the rating
   * is still gated on an unconfirmed email, and rejecting a text does not change
   * this value at all.
   */
  @ApiProperty({
    description: "Whether this rating counts toward the product's average",
    example: true,
  })
  ratingVisible!: boolean;

  /**
   * When this row's author was withdrawn, null when nobody withdrew them
   * (TASK-596).
   *
   * `ratingVisible = false` alone cannot say WHY the stars do not count: the
   * author's address may be unconfirmed (the customer can fix that) or the
   * account may be hidden (only a moderator can). The panel needs this to show
   * «приховано модератором» honestly instead of guessing.
   */
  @ApiProperty({
    description: 'When the author’s contribution was withdrawn; null when it was not',
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
  })
  hiddenAt!: Date | null;

  /**
   * Which decision withdrew it (TASK-599): a ban, a moderator, or a deleted
   * account. Null exactly when `hiddenAt` is.
   */
  @ApiProperty({
    description:
      'Why the author’s contribution was withdrawn — BAN (account switched off; lifted by the ' +
      'un-ban), MODERATOR (lifted only by a moderator’s restore), DELETED (account soft-deleted). ' +
      'Null when not withdrawn',
    enum: ReviewHiddenReason,
    enumName: 'ReviewHiddenReason',
    nullable: true,
    example: null,
  })
  hiddenReason!: ReviewHiddenReason | null;

  @ApiProperty({ description: 'Author email address', example: 'olena@example.com' })
  userEmail!: string;

  @ApiProperty({ description: 'Reviewed product name', example: 'iPhone 15 Pro Case' })
  productName!: string;

  /**
   * The product's article number (TASK-430), null when it has none.
   *
   * Exposed because the name alone is ambiguous in this catalogue — the same case
   * exists in several colours under one display name — so a moderator could not
   * tell which position a review belongs to, and had no key to look it up by.
   */
  @ApiProperty({
    description: 'Reviewed product SKU; null when the product has none',
    example: 'CASE-IP15P-BLK',
    type: String,
    nullable: true,
  })
  productSku!: string | null;

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
    entity.textStatus = row.textStatus;
    entity.ratingVisible = row.ratingVisible;
    entity.hiddenAt = row.hiddenAt;
    entity.hiddenReason = row.hiddenReason;
    entity.createdAt = row.createdAt;
    // What the shop already answered (TASK-587) — the panel needs it to show a
    // "replied" state instead of offering a fresh answer that would overwrite it.
    entity.reply = row.reply ? ReviewReplyEntity.fromPrisma(row.reply) : null;
    entity.userEmail = row.user.email;
    entity.productName = row.product.name;
    entity.productSku = row.product.sku;
    return entity;
  }
}
