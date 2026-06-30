import { Injectable } from '@nestjs/common';
import { Review } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * Allowed fields for creating a review. The review is always inserted with
 * `isActive: false` (moderation gate) — that is enforced in the repository, not
 * passed in by callers.
 */
export interface CreateReviewInput {
  userId: string;
  productId: string;
  rating: number;
  comment?: string | null;
}

/**
 * Aggregated approved-review rating for a single product. `ratingAverage` is
 * null when the product has no approved reviews. Mirrors the `ProductRating`
 * shape already used in `product.repository.ts`.
 */
export interface ReviewAggregateData {
  ratingAverage: number | null;
  ratingCount: number;
}

/**
 * A moderation-queue row: the review enriched with the author's email/name and
 * the product name, needed to render the admin table without extra lookups.
 */
export interface ReviewModerationRow extends Review {
  user: { email: string };
  product: { name: string };
}

/**
 * Result of a paginated review query.
 */
export interface PaginatedReviewsResult {
  reviews: Review[];
  total: number;
}

/**
 * Result of a paginated moderation-queue query (enriched rows).
 */
export interface PaginatedModerationResult {
  reviews: ReviewModerationRow[];
  total: number;
}

/**
 * ReviewRepository — all Prisma access for product reviews lives here
 * (Clean Architecture: services never touch PrismaClient directly).
 *
 * The `Review` model carries `isActive @default(false)` as the moderation gate:
 * a freshly submitted review is pending until an admin approves it.
 */
@Injectable()
export class ReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert a new review in the pending state (`isActive: false`). The unique
   * `(userId, productId)` constraint raises Prisma error P2002 when the user has
   * already reviewed the product — the service maps that to a 409.
   */
  create(data: CreateReviewInput): Promise<Review> {
    return this.prisma.review.create({
      data: {
        userId: data.userId,
        productId: data.productId,
        rating: data.rating,
        comment: data.comment ?? null,
        isActive: false,
      },
    });
  }

  /**
   * List approved (`isActive: true`) reviews for a product, newest first,
   * paginated. Returns the page of rows plus the total count for pagination.
   */
  async findApprovedByProduct(
    productId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedReviewsResult> {
    const skip = (page - 1) * limit;
    const where = { productId, isActive: true };
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.review.count({ where }),
    ]);
    return { reviews, total };
  }

  /**
   * Aggregate approved-review ratings for a single product: average rating and
   * count. Returns `{ ratingAverage: null, ratingCount: 0 }` when the product
   * has no approved reviews.
   */
  async aggregate(productId: string): Promise<ReviewAggregateData> {
    const groups = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { productId, isActive: true },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const group = groups[0];
    if (!group) {
      return { ratingAverage: null, ratingCount: 0 };
    }
    return { ratingAverage: group._avg.rating, ratingCount: group._count.rating };
  }

  /**
   * List reviews for the admin moderation queue, filtered by approval status,
   * newest first, paginated. Each row is enriched with the author email/name and
   * the product name. `status === 'approved'` selects `isActive: true`;
   * anything else (the `'pending'` default) selects `isActive: false`.
   */
  async findForModeration(
    status: 'pending' | 'approved',
    page: number,
    limit: number,
  ): Promise<PaginatedModerationResult> {
    const skip = (page - 1) * limit;
    const where = { isActive: status === 'approved' };
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true } },
          product: { select: { name: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return { reviews, total };
  }

  /**
   * Find a single review by id. Used by approve/reject to assert existence
   * before mutating.
   */
  findById(id: string): Promise<Review | null> {
    return this.prisma.review.findUnique({ where: { id } });
  }

  /**
   * Approve a review — flip the moderation gate to `isActive: true` so it
   * becomes visible on the storefront.
   */
  approve(id: string): Promise<Review> {
    return this.prisma.review.update({
      where: { id },
      data: { isActive: true },
    });
  }

  /**
   * Hard-delete a review (reject action). Frees the unique `(userId, productId)`
   * slot so the author may submit a fresh review later.
   */
  async delete(id: string): Promise<void> {
    await this.prisma.review.delete({ where: { id } });
  }

  /**
   * Whether the user has at least one order line item for the given product —
   * powers the "verified purchase" badge. Truthy result → verified.
   */
  async isVerifiedPurchase(userId: string, productId: string): Promise<boolean> {
    const orderItem = await this.prisma.orderItem.findFirst({
      where: { productId, order: { userId } },
      select: { id: true },
    });
    return orderItem !== null;
  }

  /**
   * Existence check used to raise a 409 before attempting an insert when a user
   * already reviewed a product. Relies on the unique `(userId, productId)` index.
   */
  findExisting(userId: string, productId: string): Promise<Review | null> {
    return this.prisma.review.findUnique({
      where: { userId_productId: { userId, productId } },
    });
  }
}
