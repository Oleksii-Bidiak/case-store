import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '@prisma/client';
import { ReviewRepository, ReviewsNotFoundError } from './review.repository';
import { ReviewEntity, ReviewAggregateEntity, AdminReviewEntity } from './entities';
import { ReviewModerationStatus } from './dto';
import type { CreateReviewDto, ReviewListQueryDto, AdminReviewQueryDto } from './dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
/** Admin moderation queue default — the one admin page size (TASK-423). */
const DEFAULT_MODERATION_LIMIT = 20;

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
 *  - public reads: the rating aggregate over every counting rating, alongside the
 *    page of approved TEXTS — two different populations since TASK-585, which is
 *    why `aggregate.ratingCount` and `meta.total` legitimately disagree,
 *  - admin moderation of the TEXT (approve / reject), which never touches the
 *    rating beside it.
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
   * text is created `PENDING` and carries a `verifiedPurchase` badge when the user
   * has an order line item for it.
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
   * A product's approved review TEXTS (paginated) together with its rating
   * aggregate.
   *
   * The two numbers are counted over DIFFERENT populations and are meant to
   * differ: `aggregate.ratingCount` is every rating that counts (star-only rows
   * included), `meta.total` is the texts this list can actually render. The owner
   * accepted that explicitly on 2026-09-10 — «кількість оцінок і кількість
   * відгуків можуть відрізнятись, і це нормально» — so nothing here reconciles
   * them. Doing so would hide the very ratings the split exists to surface.
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
    // The admin queue's own default, 20 — the one page size every admin table
    // now uses (TASK-423). Deliberately NOT the storefront's DEFAULT_LIMIT: the
    // public per-product list and a moderation backlog are read by different
    // people for different reasons.
    const limit = query.limit ?? DEFAULT_MODERATION_LIMIT;
    const status = query.status ?? ReviewModerationStatus.PENDING;

    const { reviews, total } = await this.reviewRepository.findForModeration(
      status,
      page,
      limit,
      query.search,
    );

    return {
      data: reviews.map((row) => AdminReviewEntity.fromModerationRow(row)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Publish a pending review's TEXT to the storefront. The rating beside it is
   * untouched — it was already counting, or is waiting on the author's email.
   *
   * @throws NotFoundException when no review has the given id.
   */
  async approveReview(id: string): Promise<ReviewEntity> {
    const existing = await this.reviewRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Review not found');
    }

    const approved = await this.reviewRepository.approve(id);
    this.logger.info({ reviewId: id }, 'Review text approved');
    return ReviewEntity.fromPrisma(approved);
  }

  /**
   * Turn down a review's TEXT (TASK-585). The row survives and the rating keeps
   * counting: a moderator judging a sentence is not judging the score, and the old
   * hard delete conflated the two — quietly moving the product's average as a side
   * effect, with no record that it had.
   *
   * @throws NotFoundException when no review has the given id.
   */
  async rejectReview(id: string): Promise<ReviewEntity> {
    const existing = await this.reviewRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Review not found');
    }

    const rejected = await this.reviewRepository.rejectText(id);
    this.logger.info({ reviewId: id }, 'Review text rejected (rating kept)');
    return ReviewEntity.fromPrisma(rejected);
  }

  /**
   * Approve or reject many review TEXTS at once (TASK-356) — the moderation
   * queue's per-row buttons applied to a selection, in one transaction.
   *
   * Both actions now write a status, so neither destroys anything. The log line
   * still records the count: an operator who bulk-rejects forty rows and then asks
   * "what happened to those reviews" gets an answer that matches what the database
   * actually did, which the old «deleted» wording would no longer do.
   *
   * @throws NotFoundException when any id is unknown — nothing is written.
   */
  async moderateMany(ids: string[], action: 'approve' | 'reject'): Promise<number> {
    let count: number;
    try {
      count = await this.reviewRepository.moderateMany(ids, action);
    } catch (error) {
      if (error instanceof ReviewsNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }

    this.logger.info(
      { action, count, reviewIds: ids },
      action === 'reject' ? 'Review texts rejected in bulk' : 'Review texts approved in bulk',
    );

    return count;
  }
}
