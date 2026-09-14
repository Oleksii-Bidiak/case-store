import { Injectable } from '@nestjs/common';
import { Prisma, Review, ReviewTextStatus } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * Which pile of the moderation queue to show. Maps 1:1 onto {@link ReviewTextStatus}
 * — the queue is about TEXTS, and since TASK-585 `rejected` is a population rather
 * than a hole where deleted rows used to be.
 */
export type ReviewModerationFilter = 'pending' | 'approved' | 'rejected';

/** Queue filter → the stored text status it selects. */
const MODERATION_FILTER_STATUS: Record<ReviewModerationFilter, ReviewTextStatus> = {
  pending: ReviewTextStatus.PENDING,
  approved: ReviewTextStatus.APPROVED,
  rejected: ReviewTextStatus.REJECTED,
};

/**
 * Raised by {@link ReviewRepository.moderateMany} when the batch names a review
 * that no longer exists, so the transaction rolls back instead of half-applying.
 *
 * A domain error, not a `NotFoundException`: repositories in this codebase do
 * not speak HTTP. `ReviewService` maps it.
 */
export class ReviewsNotFoundError extends Error {
  constructor(readonly missingIds: string[]) {
    super(`Unknown review id(s): ${missingIds.join(', ')}`);
    this.name = 'ReviewsNotFoundError';
  }
}

/**
 * Allowed fields for creating a review. The moderation state is not one of them:
 * the text is always inserted `PENDING` and that is enforced here, not passed in
 * by callers.
 */
export interface CreateReviewInput {
  userId: string;
  productId: string;
  rating: number;
  comment?: string | null;
}

/**
 * Aggregated rating for a single product — every rating that counts, whatever
 * became of the text beside it. `ratingAverage` is null when the product has no
 * counting ratings at all. Mirrors the `ProductRating` shape already used in
 * `product.repository.ts`, which must answer the same question the same way.
 */
export interface ReviewAggregateData {
  ratingAverage: number | null;
  ratingCount: number;
}

/**
 * A moderation-queue row: the review enriched with the author's email/name and
 * the product's name and SKU, needed to render the admin table without extra
 * lookups. `sku` is nullable because `Product.sku` is — a position may be saved
 * before an article number is assigned.
 */
export interface ReviewModerationRow extends Review {
  user: { email: string };
  product: { name: string; sku: string | null };
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
 * Since TASK-585 a review has TWO independent gates, and every query below picks
 * exactly one of them: `ratingVisible` decides whether the stars count toward the
 * product's score, `textStatus` decides whether the comment may be read. Reaching
 * for the wrong one is the whole class of bug this split introduced — and both
 * mistakes look completely normal on screen.
 */
@Injectable()
export class ReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert a new review with its text pending moderation. The unique
   * `(userId, productId)` constraint raises Prisma error P2002 when the user has
   * already reviewed the product — the service maps that to a 409.
   *
   * `textStatus` is written explicitly rather than left to the column default, so
   * the invariant lives where it is enforced: no caller can submit pre-approved
   * text. `ratingVisible` IS left to its default — that flag belongs to the email
   * gate, which is a later task's job to set.
   */
  create(data: CreateReviewInput): Promise<Review> {
    return this.prisma.review.create({
      data: {
        userId: data.userId,
        productId: data.productId,
        rating: data.rating,
        comment: data.comment ?? null,
        textStatus: ReviewTextStatus.PENDING,
      },
    });
  }

  /**
   * The public list under a product: approved TEXTS, newest first, paginated.
   *
   * Three filters, each excluding something the page must never render:
   *  - `textStatus: APPROVED` — a moderator has read it;
   *  - a non-empty `comment` — a star-only rating is a perfectly valid review that
   *    has nothing to show, and would render as an author, a date and an empty
   *    speech bubble. This is why the rating count and the number of reviews
   *    legitimately differ (the owner's decision, 2026-09-10);
   *  - `hiddenAt: null` — a moderator removed this account's whole contribution.
   *
   * Deliberately NOT filtered on `ratingVisible`: an author whose email is not yet
   * confirmed has no stars in the average, but an approved text of theirs is still
   * a text a human chose to publish.
   */
  async findApprovedByProduct(
    productId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedReviewsResult> {
    const skip = (page - 1) * limit;
    const where: Prisma.ReviewWhereInput = {
      productId,
      textStatus: ReviewTextStatus.APPROVED,
      hiddenAt: null,
      comment: { not: null },
      // `not: null` alone lets an empty string through, and the submission DTO
      // accepts one — `comment: ''` is a star-only review wearing a text's clothes.
      NOT: { comment: '' },
    };
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
   * The product's rating: average and count over every rating that COUNTS.
   *
   * `ratingVisible` alone — the text's fate is irrelevant here, which is the
   * owner's decision of 2026-09-10 made literal. A three-star rating whose comment
   * is still in the queue is part of the average today. Hidden accounts need no arm
   * of their own: `ratingVisible` is the denormalised effective flag and already
   * folds them in.
   *
   * Returns `{ ratingAverage: null, ratingCount: 0 }` when nothing counts, so the
   * storefront can say «ще немає оцінок» instead of rendering a zero-star product.
   *
   * MUST stay in step with `ProductRepository.getRatingsByProductId`, which answers
   * the same question for the catalogue listing.
   */
  async aggregate(productId: string): Promise<ReviewAggregateData> {
    const groups = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { productId, ratingVisible: true },
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
   * List reviews for the admin moderation queue, filtered by the TEXT's status,
   * newest first, paginated. Each row is enriched with the author email/name and
   * the product name.
   *
   * Three piles rather than the old two: since TASK-585 a rejection is a verdict
   * the row keeps, not a deletion, so `rejected` selects something that exists and
   * can be re-read — or reversed.
   */
  async findForModeration(
    status: ReviewModerationFilter,
    page: number,
    limit: number,
    search?: string,
  ): Promise<PaginatedModerationResult> {
    const skip = (page - 1) * limit;
    const where: Prisma.ReviewWhereInput = { textStatus: MODERATION_FILTER_STATUS[status] };

    // TASK-423: free-text search over the three things the queue actually
    // displays — the review text, who wrote it, and what it is about. The arms
    // mirror the semantics of `OrderRepository.findAllForAdmin` (case-insensitive
    // `contains`, OR-ed): an operator types a fragment of a name or a product,
    // not a prefix, and «Чохол» must match `чохол`.
    //
    // No phone arm here (unlike orders): a review carries no phone, and the join
    // to `user` would have to widen for a column the queue never shows.
    if (search) {
      where.OR = [
        { comment: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { product: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true } },
          // `sku` joined since TASK-430: two positions in this catalogue can share
          // a display name (the same case in two colours), so a moderator reading
          // «Чохол силіконовий» could not tell WHICH one the review is about — and
          // the SKU is what they then search the catalogue by.
          product: { select: { name: true, sku: true } },
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
   * Publish a review's TEXT. Touches nothing else: the rating was already counting
   * (or already gated by the author's unconfirmed email), and approving a sentence
   * is not a statement about either.
   */
  approve(id: string): Promise<Review> {
    return this.prisma.review.update({
      where: { id },
      data: { textStatus: ReviewTextStatus.APPROVED },
    });
  }

  /**
   * Turn down a review's TEXT (TASK-585). The row stays, the rating keeps counting,
   * and only the verdict moves.
   *
   * This replaces a hard delete. The old behaviour had two costs that were never
   * visible from the admin panel: the author's rating disappeared from the
   * product's average, and the freed `(userId, productId)` slot let the same person
   * post the same text again — so rejecting abuse was also inviting it back.
   */
  rejectText(id: string): Promise<Review> {
    return this.prisma.review.update({
      where: { id },
      data: { textStatus: ReviewTextStatus.REJECTED },
    });
  }

  /**
   * Approve or reject many review TEXTS at once (TASK-356), in one transaction.
   *
   * All-or-nothing on purpose: missing ids abort before any write — including the
   * case where a colleague moderated the same queue a second earlier, which is
   * exactly when two people are working a review backlog together. Nothing is
   * destroyed either way since TASK-585, so a half-applied batch is now merely
   * confusing rather than unrecoverable, but a moderation queue that silently
   * skipped part of a selection would still leave rows nobody looks at again.
   *
   * Returns how many rows were written.
   */
  async moderateMany(ids: string[], action: 'approve' | 'reject'): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.review.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });

      if (found.length !== ids.length) {
        const known = new Set(found.map((row) => row.id));
        throw new ReviewsNotFoundError(ids.filter((id) => !known.has(id)));
      }

      const { count } = await tx.review.updateMany({
        where: { id: { in: ids } },
        data: {
          textStatus: action === 'reject' ? ReviewTextStatus.REJECTED : ReviewTextStatus.APPROVED,
        },
      });
      return count;
    });
  }

  /**
   * Whether the user has at least one order line item for the given product —
   * powers the "verified purchase" badge. Truthy result → verified.
   *
   * Single-review path (submission). Lists use {@link findVerifiedPurchaserIds}.
   */
  async isVerifiedPurchase(userId: string, productId: string): Promise<boolean> {
    const orderItem = await this.prisma.orderItem.findFirst({
      where: { productId, order: { userId } },
      select: { id: true },
    });
    return orderItem !== null;
  }

  /**
   * Which of `userIds` have at least one order line item for `productId` — the BATCHED twin
   * of {@link isVerifiedPurchase}, resolving the verified-purchase badge for a WHOLE review
   * page in one query instead of one per review (the N+1 the public product-reviews endpoint
   * used to fan out; same shape as `ProductRepository.getRatingsByProductId`).
   *
   * The predicate is deliberately IDENTICAL to `isVerifiedPurchase`'s — an order of the user's
   * containing the product, whatever its status and including soft-deleted ones. The badge
   * must not change, only the query count. Users absent from the returned set are unverified.
   */
  async findVerifiedPurchaserIds(productId: string, userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) {
      return new Set();
    }
    // Grouped from the ORDER side: `distinct` needs a scalar, and `Order.userId` is one —
    // `OrderItem` only reaches the user through its relation.
    const orders = await this.prisma.order.findMany({
      where: { userId: { in: userIds }, items: { some: { productId } } },
      select: { userId: true },
      distinct: ['userId'],
    });
    // `Order.userId` is nullable since TASK-338 (guest orders), so the select is typed
    // `string | null`. A null cannot actually reach here — SQL `IN` never matches NULL,
    // so the `userIds` filter already excludes guest orders — but it is dropped rather
    // than cast, because that is also the correct behaviour: a guest purchase carries no
    // account to attach a verified-purchase badge to.
    return new Set(orders.flatMap((order) => (order.userId === null ? [] : [order.userId])));
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
