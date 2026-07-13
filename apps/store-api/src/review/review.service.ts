import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '@prisma/client';
import { ReviewRepository } from './review.repository';
import { ReviewEntity, ReviewAggregateEntity, AdminReviewEntity } from './entities';
import { ReviewModerationStatus } from './dto';
import type { CreateReviewDto, ReviewListQueryDto, AdminReviewQueryDto } from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

/**
 * Pagination metadata returned alongside review lists.
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Response shape for the public product-reviews endpoint: the page of approved
 * reviews, the product's rating aggregate, and pagination metadata.
 */
export interface ApprovedReviewsResult {
  data: ReviewEntity[];
  aggregate: ReviewAggregateEntity;
  meta: PaginationMeta;
}

/**
 * Response shape for the admin moderation queue.
 */
export interface ModerationReviewsResult {
  data: AdminReviewEntity[];
  meta: PaginationMeta;
}

/**
 * ReviewService — business logic for product reviews.
 *
 * Responsibilities:
 *  - submission with the one-review-per-user-per-product guard (409) and the
 *    verified-purchase badge,
 *  - public reads gated to approved reviews only,
 *  - admin moderation (approve flips `isActive`; reject hard-deletes the row).
 *
 * The service never touches Prisma directly — all persistence goes through
 * {@link ReviewRepository}.
 */
@Injectable()
export class ReviewService {
  constructor(
    private readonly reviewRepository: ReviewRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ReviewService.name);
  }

  /**
   * Submit a review for a product on behalf of an authenticated user.
   *
   * A user may review a product only once: the unique `(userId, productId)`
   * slot is checked up front and again defensively by catching Prisma's P2002
   * (handles the race where two requests pass the pre-check concurrently). The
   * review is created pending (`isActive: false`) and carries a
   * `verifiedPurchase` badge when the user has an order line item for it.
   *
   * @throws ConflictException when the user already reviewed the product.
   */
  async submitReview(
    userId: string,
    productId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewEntity> {
    const existing = await this.reviewRepository.findExisting(userId, productId);
    if (existing) {
      throw new ConflictException('You have already reviewed this product');
    }

    const verifiedPurchase = await this.reviewRepository.isVerifiedPurchase(userId, productId);

    let review;
    try {
      review = await this.reviewRepository.create({
        userId,
        productId,
        rating: dto.rating,
        comment: dto.comment ?? null,
      });
    } catch (error) {
      // P2002 = unique constraint violation: a concurrent request inserted the
      // review between the pre-check and this insert. Surface the same 409.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already reviewed this product');
      }
      throw error;
    }

    this.logger.info({ reviewId: review.id, userId, productId }, 'Review submitted (pending)');
    return ReviewEntity.fromPrisma(review, verifiedPurchase);
  }

  /**
   * List a product's approved reviews (paginated) together with its rating
   * aggregate. Only `isActive: true` reviews are returned — pending submissions
   * never leak to the storefront.
   */
  async getApprovedReviews(
    productId: string,
    query: ReviewListQueryDto,
  ): Promise<ApprovedReviewsResult> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const [{ reviews, total }, aggregate] = await Promise.all([
      this.reviewRepository.findApprovedByProduct(productId, page, limit),
      this.reviewRepository.aggregate(productId),
    ]);

    // The verified-purchase badge for the WHOLE page in ONE query. This used to be one
    // `isVerifiedPurchase` call per review inside a `Promise.all` — an N+1 that grew with the
    // page size (≤ 50) on a PUBLIC, uncached endpoint. The badge rule is unchanged: an author
    // is verified iff they have an order line item for this product.
    const verifiedUserIds = await this.reviewRepository.findVerifiedPurchaserIds(productId, [
      ...new Set(reviews.map((review) => review.userId)),
    ]);

    const data = reviews.map((review) =>
      ReviewEntity.fromPrisma(review, verifiedUserIds.has(review.userId)),
    );

    return {
      data,
      aggregate: ReviewAggregateEntity.fromAggregate(aggregate),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * List reviews for the admin moderation queue, filtered by status
   * (`pending` by default). Rows are enriched with author email and product
   * name for the admin table.
   */
  async getReviewsForModeration(query: AdminReviewQueryDto): Promise<ModerationReviewsResult> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const status = query.status ?? ReviewModerationStatus.PENDING;

    const { reviews, total } = await this.reviewRepository.findForModeration(status, page, limit);

    return {
      data: reviews.map((row) => AdminReviewEntity.fromModerationRow(row)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Approve a pending review, publishing it to the storefront.
   *
   * @throws NotFoundException when no review has the given id.
   */
  async approveReview(id: string): Promise<ReviewEntity> {
    const existing = await this.reviewRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Review not found');
    }

    const approved = await this.reviewRepository.approve(id);
    this.logger.info({ reviewId: id }, 'Review approved');
    return ReviewEntity.fromPrisma(approved);
  }

  /**
   * Reject a review by hard-deleting it. This frees the unique
   * `(userId, productId)` slot so the author may submit a new review later.
   *
   * @throws NotFoundException when no review has the given id.
   */
  async rejectReview(id: string): Promise<void> {
    const existing = await this.reviewRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Review not found');
    }

    await this.reviewRepository.delete(id);
    this.logger.info({ reviewId: id }, 'Review rejected (deleted)');
  }
}
