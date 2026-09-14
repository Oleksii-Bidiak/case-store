import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma, type Review } from '@prisma/client';
import { ReviewRepository, ReviewsNotFoundError } from './review.repository';
import {
  ReviewEntity,
  ReviewAggregateEntity,
  AdminReviewEntity,
  OwnReviewEntity,
  ReviewReplyEntity,
} from './entities';
import { ReviewModerationStatus } from './dto';
import type {
  CreateReviewDto,
  ReviewListQueryDto,
  AdminReviewQueryDto,
  UpdateReviewDto,
  CreateReviewReplyDto,
} from './dto';

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
   * ## The email gate (TASK-588, the owner's decision 7)
   *
   * A rating from an author who has not confirmed their address is STORED but
   * does not count. Not refused: refusing would throw away the ratings of the
   * many people who confirm a day later, and would tell a spammer exactly which
   * of their accounts is worth verifying. The verdict is written into
   * `ratingVisible` at insert time rather than derived on read, because the
   * catalogue asks "does this count?" for every card on every page and cannot
   * afford to join `users` for the answer.
   *
   * `createdIp` is recorded for the abuse signals (TASK-589) and for nothing
   * else.
   *
   * @throws ConflictException when the user already reviewed the product.
   */
  async submitReview(
    userId: string,
    productId: string,
    dto: CreateReviewDto,
    createdIp: string | null,
  ): Promise<ReviewEntity> {
    const existing = await this.reviewRepository.findExisting(userId, productId);
    if (existing) {
      throw new ConflictException('You have already reviewed this product');
    }

    const [verifiedPurchase, emailVerified, authorHidden] = await Promise.all([
      this.reviewRepository.isVerifiedPurchase(userId, productId),
      this.reviewRepository.isEmailVerified(userId),
      this.reviewRepository.isAuthorHidden(userId),
    ]);

    // Both gates, and the moderator's outranks the author's own (TASK-598). A
    // withdrawn account is not banned and not logged out, so without this arm it
    // simply went on submitting: the thirty ratings a moderator had just pulled
    // came straight back as thirty new ones that counted on arrival.
    const ratingVisible = emailVerified && !authorHidden;

    let review: Review;
    try {
      review = await this.reviewRepository.create({
        userId,
        productId,
        rating: dto.rating,
        comment: dto.comment ?? null,
        ratingVisible,
        createdIp,
        // Stamped so the row is withdrawn on every path the flag governs — the
        // public list, the author's own view, the moderation queue — and not only
        // in the average.
        hiddenAt: authorHidden ? new Date() : null,
      });
    } catch (error) {
      // P2002 = unique constraint violation: a concurrent request inserted the
      // review between the pre-check and this insert. Surface the same 409.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already reviewed this product');
      }
      throw error;
    }

    // `ratingVisible` is logged because it is the one thing about a submission
    // that is invisible to the person who made it: an unconfirmed author sees
    // their review accepted and their stars never appear anywhere.
    this.logger.info(
      { reviewId: review.id, userId, productId, ratingVisible },
      'Review submitted (pending)',
    );
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
   * The caller's own review of a product, or null (TASK-586).
   *
   * The storefront cannot offer «дописати текст» without first knowing there is a
   * rating to add text to, and it cannot learn that from the public list: a
   * star-only row deliberately never appears there. Hence a separate read, in the
   * author's own projection — see {@link OwnReviewEntity} for what it does and
   * does not carry.
   */
  async getOwnReview(userId: string, productId: string): Promise<OwnReviewEntity | null> {
    const review = await this.reviewRepository.findOwnByProduct(userId, productId);
    return review ? OwnReviewEntity.fromPrisma(review) : null;
  }

  /**
   * The author adds or changes the text beside a rating they already left
   * (TASK-586 — owner's decision 5, 2026-09-10). The new text goes back to
   * moderation; the rating does not move.
   *
   * An ABSENT `comment` is not an erasure. `{}` is what a half-wired form sends,
   * and reading it as «clear the text» would wipe a published comment, drop the
   * row back into the queue, and leave the author with no copy of what they wrote
   * — all in answer to a request that asked for nothing. So the row is returned
   * unchanged instead.
   *
   * @throws NotFoundException when no such review exists, when it belongs to
   *         somebody else, or when its author has been hidden — one answer for
   *         three cases, because distinguishing them is what makes an oracle.
   */
  async updateOwnReview(
    userId: string,
    id: string,
    dto: UpdateReviewDto,
  ): Promise<OwnReviewEntity> {
    const existing = await this.reviewRepository.findOwnById(id, userId);
    if (!existing) {
      throw new NotFoundException('Review not found');
    }

    if (dto.comment === undefined) {
      return OwnReviewEntity.fromPrisma(existing);
    }

    const updated = await this.reviewRepository.updateComment(id, dto.comment);
    this.logger.info(
      { reviewId: id, userId },
      'Review text edited by its author (back to PENDING)',
    );
    return OwnReviewEntity.fromPrisma(updated);
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
   * The shop answers a review (TASK-587 — owner's decision of 2026-09-14).
   *
   * One answer per review, so posting again REPLACES the text rather than adding
   * a second: there is no thread, and a correction is a normal thing to need.
   *
   * `actorUserId` is recorded on the row for accountability and is deliberately
   * absent from what comes back — the customer is answered by the shop, not by an
   * employee. See {@link ReviewReplyEntity}.
   *
   * @throws NotFoundException when no review has the given id.
   */
  async replyToReview(
    id: string,
    actorUserId: string,
    dto: CreateReviewReplyDto,
  ): Promise<ReviewReplyEntity> {
    const existing = await this.reviewRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Review not found');
    }

    const reply = await this.reviewRepository.upsertReply(id, actorUserId, dto.body);
    this.logger.info({ reviewId: id, actorUserId }, 'Shop reply saved');
    return ReviewReplyEntity.fromPrisma(reply);
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

  /**
   * Withdraw everything an account ever wrote — every rating and every text
   * (TASK-589, the owner's 2026-09-10 decision).
   *
   * Per-row moderation is the wrong instrument here. It answers "is this sentence
   * publishable", one click at a time, and an abuser with thirty ratings costs
   * thirty clicks — while the RATINGS never reach the moderation queue at all, so
   * the screen an operator is looking at does not even show the damage.
   *
   * Also called when an account is banned, which is the other half of the same
   * decision: a ban that leaves the banned person's words on the storefront is
   * not the action the operator thought they were taking.
   *
   * @returns how many reviews were withdrawn.
   */
  async hideAuthor(userId: string): Promise<number> {
    const count = await this.reviewRepository.hideAuthorReviews(userId);
    this.logger.info({ userId, count }, 'Author contribution hidden');
    return count;
  }

  /**
   * Restore an account's contribution (TASK-589).
   *
   * The email gate is RE-ASKED rather than assumed. `ratingVisible` folds two
   * independent gates — a moderator's `hiddenAt` and a proven address — and this
   * call lifts only the first. Forcing the second open would mean an account that
   * never confirmed its address could be handed counting ratings by way of an
   * ordinary un-ban, which no screen in the panel would report.
   *
   * @returns how many reviews were restored.
   */
  async unhideAuthor(userId: string): Promise<number> {
    const ratingVisible = await this.reviewRepository.isEmailVerified(userId);
    const count = await this.reviewRepository.restoreAuthorReviews(userId, ratingVisible);
    this.logger.info({ userId, count, ratingVisible }, 'Author contribution restored');
    return count;
  }
}
