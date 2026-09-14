import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma, Review, ReviewReply, ReviewTextStatus } from '@prisma/client';
import { ReviewRepository, ReviewsNotFoundError } from './review.repository';
import { ReviewService } from './review.service';
import { ReviewModerationStatus } from './dto';

// ─── Constants ──────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const PRODUCT_ID = 'product-uuid-1';
const now = new Date('2026-06-30T12:00:00.000Z');

const makeReview = (overrides: Partial<Review> = {}): Review => ({
  id: 'review-uuid-1',
  userId: USER_ID,
  productId: PRODUCT_ID,
  rating: 5,
  comment: 'Great case!',
  // The submission default since TASK-585: the rating waits on the email gate,
  // the text waits on a moderator, and the two are no longer the same question.
  ratingVisible: false,
  textStatus: ReviewTextStatus.PENDING,
  hiddenAt: null,
  createdIp: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

/** A shop reply row as Prisma returns it — author id included, as the table has it. */
const makeReply = (overrides: Partial<ReviewReply> = {}): ReviewReply => ({
  id: 'reply-uuid-1',
  reviewId: 'review-uuid-1',
  authorUserId: 'staff-uuid-1',
  body: 'Дякуємо! Передали ваш відгук виробнику.',
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

// ─── Mocks ──────────────────────────────────────────────────────────────────

const reviewRepositoryMock = {
  create: jest.fn(),
  findApprovedByProduct: jest.fn(),
  aggregate: jest.fn(),
  findForModeration: jest.fn(),
  findById: jest.fn(),
  findOwnByProduct: jest.fn(),
  findOwnById: jest.fn(),
  updateComment: jest.fn(),
  upsertReply: jest.fn(),
  approve: jest.fn(),
  rejectText: jest.fn(),
  moderateMany: jest.fn(),
  isVerifiedPurchase: jest.fn(),
  findVerifiedPurchaserIds: jest.fn(),
  findExisting: jest.fn(),
};

const pinoLoggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ReviewService', () => {
  let service: ReviewService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        { provide: ReviewRepository, useValue: reviewRepositoryMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
      ],
    }).compile();

    service = module.get<ReviewService>(ReviewService);
  });

  // ─── submitReview ───────────────────────────────────────────────────────────

  describe('submitReview', () => {
    it('throws ConflictException when the user already reviewed the product', async () => {
      reviewRepositoryMock.findExisting.mockResolvedValue(makeReview());

      await expect(service.submitReview(USER_ID, PRODUCT_ID, { rating: 4 })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(reviewRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('creates the review and returns the entity', async () => {
      reviewRepositoryMock.findExisting.mockResolvedValue(null);
      reviewRepositoryMock.isVerifiedPurchase.mockResolvedValue(false);
      reviewRepositoryMock.create.mockResolvedValue(makeReview());

      const result = await service.submitReview(USER_ID, PRODUCT_ID, {
        rating: 5,
        comment: 'Great case!',
      });

      expect(reviewRepositoryMock.create).toHaveBeenCalledWith({
        userId: USER_ID,
        productId: PRODUCT_ID,
        rating: 5,
        comment: 'Great case!',
      });
      expect(result.id).toBe('review-uuid-1');
    });

    // TASK-585: the public entity stops advertising moderation state. It used to
    // carry `isActive`, which told the author's own browser — and anyone reading
    // the response — that their text was queued, and told an admin's approve call
    // nothing useful either. Moderation state now lives on the admin projection.
    it('does not tell the storefront anything about moderation state', async () => {
      reviewRepositoryMock.findExisting.mockResolvedValue(null);
      reviewRepositoryMock.isVerifiedPurchase.mockResolvedValue(false);
      reviewRepositoryMock.create.mockResolvedValue(makeReview());

      const result = await service.submitReview(USER_ID, PRODUCT_ID, { rating: 5 });

      expect(result).not.toHaveProperty('isActive');
      expect(result).not.toHaveProperty('textStatus');
      expect(result).not.toHaveProperty('ratingVisible');
    });

    it('returns verifiedPurchase = true when the user has purchased the product', async () => {
      reviewRepositoryMock.findExisting.mockResolvedValue(null);
      reviewRepositoryMock.isVerifiedPurchase.mockResolvedValue(true);
      reviewRepositoryMock.create.mockResolvedValue(makeReview());

      const result = await service.submitReview(USER_ID, PRODUCT_ID, { rating: 5 });

      expect(result.verifiedPurchase).toBe(true);
    });

    it('returns verifiedPurchase = false when the user has not purchased the product', async () => {
      reviewRepositoryMock.findExisting.mockResolvedValue(null);
      reviewRepositoryMock.isVerifiedPurchase.mockResolvedValue(false);
      reviewRepositoryMock.create.mockResolvedValue(makeReview());

      const result = await service.submitReview(USER_ID, PRODUCT_ID, { rating: 5 });

      expect(result.verifiedPurchase).toBe(false);
    });

    it('maps a Prisma P2002 unique-violation race to ConflictException', async () => {
      reviewRepositoryMock.findExisting.mockResolvedValue(null);
      reviewRepositoryMock.isVerifiedPurchase.mockResolvedValue(false);
      reviewRepositoryMock.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.0.0',
        }),
      );

      await expect(service.submitReview(USER_ID, PRODUCT_ID, { rating: 5 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  // ─── getApprovedReviews ───────────────────────────────────────────────────────

  describe('getApprovedReviews', () => {
    it('returns only approved reviews with aggregate and pagination meta', async () => {
      reviewRepositoryMock.findApprovedByProduct.mockResolvedValue({
        reviews: [makeReview({ textStatus: ReviewTextStatus.APPROVED, ratingVisible: true })],
        total: 1,
      });
      reviewRepositoryMock.aggregate.mockResolvedValue({ ratingAverage: 5, ratingCount: 1 });
      reviewRepositoryMock.findVerifiedPurchaserIds.mockResolvedValue(new Set<string>());

      const result = await service.getApprovedReviews(PRODUCT_ID, {});

      expect(reviewRepositoryMock.findApprovedByProduct).toHaveBeenCalledWith(PRODUCT_ID, 1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).not.toHaveProperty('isActive');
      expect(result.aggregate.ratingAverage).toBe(5);
      expect(result.aggregate.ratingCount).toBe(1);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, totalPages: 1 });
    });

    // TASK-585: the two numbers on the reviews tab are now allowed to disagree, and
    // the owner said so explicitly — "кількість оцінок і кількість відгуків можуть
    // відрізнятись, і це нормально". The aggregate counts ratings (star-only rows
    // included); `meta.total` counts the texts the list can actually render. A
    // service that quietly reconciled them would be hiding the ratings the split
    // exists to surface.
    it('lets the rating count exceed the number of texts on the page', async () => {
      reviewRepositoryMock.findApprovedByProduct.mockResolvedValue({
        reviews: [makeReview({ textStatus: ReviewTextStatus.APPROVED, ratingVisible: true })],
        total: 1,
      });
      // Nine ratings on the product, one of them with an approved text.
      reviewRepositoryMock.aggregate.mockResolvedValue({ ratingAverage: 4.4, ratingCount: 9 });
      reviewRepositoryMock.findVerifiedPurchaserIds.mockResolvedValue(new Set<string>());

      const result = await service.getApprovedReviews(PRODUCT_ID, {});

      expect(result.aggregate.ratingCount).toBe(9);
      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    // TASK-298: the badge used to be resolved with one `isVerifiedPurchase` call PER review
    // (an N+1). It is now one batched lookup for the page — the badge itself must not change.
    it('badges a MIXED page correctly from a single batched lookup (no per-review query)', async () => {
      const buyer = 'user-buyer';
      const nonBuyer = 'user-non-buyer';
      reviewRepositoryMock.findApprovedByProduct.mockResolvedValue({
        reviews: [
          makeReview({ id: 'r-buyer', userId: buyer, textStatus: ReviewTextStatus.APPROVED }),
          makeReview({
            id: 'r-non-buyer',
            userId: nonBuyer,
            textStatus: ReviewTextStatus.APPROVED,
          }),
        ],
        total: 2,
      });
      reviewRepositoryMock.aggregate.mockResolvedValue({ ratingAverage: 5, ratingCount: 2 });
      reviewRepositoryMock.findVerifiedPurchaserIds.mockResolvedValue(new Set([buyer]));

      const result = await service.getApprovedReviews(PRODUCT_ID, {});

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({ id: 'r-buyer', verifiedPurchase: true });
      expect(result.data[1]).toMatchObject({ id: 'r-non-buyer', verifiedPurchase: false });

      expect(reviewRepositoryMock.findVerifiedPurchaserIds).toHaveBeenCalledTimes(1);
      expect(reviewRepositoryMock.findVerifiedPurchaserIds).toHaveBeenCalledWith(PRODUCT_ID, [
        buyer,
        nonBuyer,
      ]);
      expect(reviewRepositoryMock.isVerifiedPurchase).not.toHaveBeenCalled();
    });

    it('asks about no authors at all for an empty page', async () => {
      reviewRepositoryMock.findApprovedByProduct.mockResolvedValue({ reviews: [], total: 0 });
      reviewRepositoryMock.aggregate.mockResolvedValue({ ratingAverage: null, ratingCount: 0 });
      reviewRepositoryMock.findVerifiedPurchaserIds.mockResolvedValue(new Set<string>());

      const result = await service.getApprovedReviews(PRODUCT_ID, {});

      expect(result.data).toEqual([]);
      expect(reviewRepositoryMock.findVerifiedPurchaserIds).toHaveBeenCalledWith(PRODUCT_ID, []);
    });
  });

  // ─── getReviewsForModeration ──────────────────────────────────────────────────

  describe('getReviewsForModeration', () => {
    it('returns the pending queue by default with author/product fields', async () => {
      reviewRepositoryMock.findForModeration.mockResolvedValue({
        reviews: [
          {
            ...makeReview(),
            user: { email: 'olena@example.com' },
            product: { name: 'iPhone 15 Pro Case', sku: 'CASE-IP15P-BLK' },
          },
        ],
        total: 1,
      });

      const result = await service.getReviewsForModeration({});

      // 20, not 10: the admin queue took the one admin page size in TASK-423.
      // `undefined` is the search — absent, not an empty string, which would
      // reach Prisma as `contains: ''` and match every review.
      expect(reviewRepositoryMock.findForModeration).toHaveBeenCalledWith(
        'pending',
        1,
        20,
        undefined,
      );
      expect(result.data[0].userEmail).toBe('olena@example.com');
      expect(result.data[0].productName).toBe('iPhone 15 Pro Case');
      // TASK-430: the queue shows the SKU next to the name, because the name alone
      // does not identify a position in a catalogue with colour variants.
      expect(result.data[0].productSku).toBe('CASE-IP15P-BLK');
      expect(result.meta.total).toBe(1);
    });

    it('carries a null SKU through rather than inventing a placeholder', async () => {
      reviewRepositoryMock.findForModeration.mockResolvedValue({
        reviews: [
          {
            ...makeReview(),
            user: { email: 'olena@example.com' },
            // `Product.sku` is nullable — a position can be saved before an
            // article number is assigned. The wire value must stay null so the
            // panel can say «без артикулу» instead of rendering "null".
            product: { name: 'iPhone 15 Pro Case', sku: null },
          },
        ],
        total: 1,
      });

      const result = await service.getReviewsForModeration({});

      expect(result.data[0].productSku).toBeNull();
    });

    it('passes the approved status through to the repository', async () => {
      reviewRepositoryMock.findForModeration.mockResolvedValue({ reviews: [], total: 0 });

      await service.getReviewsForModeration({ status: ReviewModerationStatus.APPROVED });

      expect(reviewRepositoryMock.findForModeration).toHaveBeenCalledWith(
        'approved',
        1,
        20,
        undefined,
      );
    });

    // TASK-585: rejected rows survive now, so there is a third pile to look at.
    // Without this filter the only way to review a moderation decision would be
    // to remember it.
    it('passes the rejected status through — those rows still exist', async () => {
      reviewRepositoryMock.findForModeration.mockResolvedValue({ reviews: [], total: 0 });

      await service.getReviewsForModeration({ status: ReviewModerationStatus.REJECTED });

      expect(reviewRepositoryMock.findForModeration).toHaveBeenCalledWith(
        'rejected',
        1,
        20,
        undefined,
      );
    });

    // TASK-585: the admin projection is where moderation state lives now that the
    // public one has none. A queue row that cannot say whether a rating is still
    // counting leaves the moderator unable to tell an approved text from a hidden
    // account's approved text.
    it('exposes the text status and the rating visibility on the queue row', async () => {
      reviewRepositoryMock.findForModeration.mockResolvedValue({
        reviews: [
          {
            ...makeReview({ textStatus: ReviewTextStatus.REJECTED, ratingVisible: true }),
            user: { email: 'olena@example.com' },
            product: { name: 'iPhone 15 Pro Case', sku: 'CASE-IP15P-BLK' },
          },
        ],
        total: 1,
      });

      const result = await service.getReviewsForModeration({});

      expect(result.data[0].textStatus).toBe('REJECTED');
      expect(result.data[0].ratingVisible).toBe(true);
      expect(result.data[0]).not.toHaveProperty('isActive');
    });

    // TASK-423: the queue had no search at all. A term that reached the service
    // but not the repository would render a full, unfiltered queue — which looks
    // like "nothing matched my typo" rather than "the filter was dropped".
    it('forwards the search term and the requested page size', async () => {
      reviewRepositoryMock.findForModeration.mockResolvedValue({ reviews: [], total: 0 });

      await service.getReviewsForModeration({ page: 3, limit: 100, search: 'чохол' });

      expect(reviewRepositoryMock.findForModeration).toHaveBeenCalledWith(
        'pending',
        3,
        100,
        'чохол',
      );
    });
  });

  // ─── approveReview ────────────────────────────────────────────────────────────

  describe('approveReview', () => {
    it('throws NotFoundException when the review does not exist', async () => {
      reviewRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.approveReview('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(reviewRepositoryMock.approve).not.toHaveBeenCalled();
    });

    it('approves the review and returns the entity', async () => {
      reviewRepositoryMock.findById.mockResolvedValue(makeReview());
      reviewRepositoryMock.approve.mockResolvedValue(
        makeReview({ textStatus: ReviewTextStatus.APPROVED }),
      );

      const result = await service.approveReview('review-uuid-1');

      expect(reviewRepositoryMock.approve).toHaveBeenCalledWith('review-uuid-1');
      expect(result.id).toBe('review-uuid-1');
    });
  });

  // ─── rejectReview (TASK-585: the rating is not collateral) ───────────────────

  describe('rejectReview', () => {
    it('throws NotFoundException when the review does not exist', async () => {
      reviewRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.rejectReview('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(reviewRepositoryMock.rejectText).not.toHaveBeenCalled();
    });

    it('marks the text REJECTED and leaves the rating exactly where it was', async () => {
      // The whole point of TASK-585. Rejecting used to hard-delete the row, so a
      // moderator binning one unusable sentence also removed a 5★ from the
      // product's average — a score change nobody asked for and nothing recorded.
      reviewRepositoryMock.findById.mockResolvedValue(
        makeReview({ rating: 5, ratingVisible: true }),
      );
      reviewRepositoryMock.rejectText.mockResolvedValue(
        makeReview({ rating: 5, ratingVisible: true, textStatus: ReviewTextStatus.REJECTED }),
      );

      const result = await service.rejectReview('review-uuid-1');

      expect(reviewRepositoryMock.rejectText).toHaveBeenCalledWith('review-uuid-1');
      expect(result.rating).toBe(5);
      expect(result.id).toBe('review-uuid-1');
    });

    // The destructive path is gone from the seam itself, not merely unused: a
    // `delete` still hanging off the repository is a loaded gun for the next
    // person who reads "reject" and reaches for the obvious method.
    it('leaves the repository with no delete method to reach for', () => {
      expect(ReviewRepository.prototype).not.toHaveProperty('delete');
    });
  });

  // ─── moderateMany (bulk, TASK-356) ────────────────────────────────────────────

  describe('moderateMany', () => {
    it('approves the whole selection and reports the DB count', async () => {
      reviewRepositoryMock.moderateMany.mockResolvedValue(3);

      const count = await service.moderateMany(['a', 'b', 'c'], 'approve');

      expect(count).toBe(3);
      expect(reviewRepositoryMock.moderateMany).toHaveBeenCalledWith(['a', 'b', 'c'], 'approve');
    });

    it('passes reject through as reject — it is a text verdict, not an inverse approve', async () => {
      reviewRepositoryMock.moderateMany.mockResolvedValue(2);

      await service.moderateMany(['a', 'b'], 'reject');

      expect(reviewRepositoryMock.moderateMany).toHaveBeenCalledWith(['a', 'b'], 'reject');
    });

    it('maps the repository domain error to 404', async () => {
      reviewRepositoryMock.moderateMany.mockRejectedValue(new ReviewsNotFoundError(['gone']));

      await expect(service.moderateMany(['a', 'gone'], 'reject')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    // TASK-585: the log line must stop saying "deleted". Nothing is deleted any
    // more, and a log that claims otherwise is worse than no log — it is what an
    // operator would be shown when they ask where a review went, and it would send
    // them looking for a row that is still sitting in the table.
    it('records a bulk rejection without claiming anything was deleted', async () => {
      reviewRepositoryMock.moderateMany.mockResolvedValue(5);

      await service.moderateMany(['a', 'b', 'c', 'd', 'e'], 'reject');

      expect(pinoLoggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'reject', count: 5 }),
        expect.not.stringContaining('deleted'),
      );
    });
  });

  // ─── getOwnReview (TASK-586) ────────────────────────────────────────────────
  //
  // The author's own view of their own row. It exists because of the owner's
  // decision 5 (2026-09-10): a person may come back and add text to a rating they
  // already left — and the storefront cannot offer that without first being told
  // there is a rating to add text to. The public list cannot answer it, because a
  // star-only row never appears there.

  describe('getOwnReview', () => {
    it('answers null when this author has not reviewed this product', async () => {
      reviewRepositoryMock.findOwnByProduct.mockResolvedValue(null);

      await expect(service.getOwnReview(USER_ID, PRODUCT_ID)).resolves.toBeNull();
    });

    it("tells the author their own text's verdict — and nothing the moderator keeps private", async () => {
      // `textStatus` IS the author's business: «на модерації» and «відхилено» are
      // the two things they need told, and withholding them leaves someone
      // re-submitting into a queue they cannot see. `hiddenAt` and `createdIp` are
      // not: one is a moderator's lever the author must not be able to probe, the
      // other is theirs but is kept for abuse signals, not for display.
      reviewRepositoryMock.findOwnByProduct.mockResolvedValue(
        makeReview({ textStatus: ReviewTextStatus.REJECTED, createdIp: '203.0.113.7' }),
      );

      const result = await service.getOwnReview(USER_ID, PRODUCT_ID);

      expect(result).not.toBeNull();
      expect(result?.textStatus).toBe(ReviewTextStatus.REJECTED);
      expect(result?.rating).toBe(5);
      expect(result).not.toHaveProperty('hiddenAt');
      expect(result).not.toHaveProperty('createdIp');
    });
  });

  // ─── updateOwnReview (TASK-586) ─────────────────────────────────────────────

  describe('updateOwnReview', () => {
    it('asks for the row BY AUTHOR, so a stranger gets a 404 and not a 403', async () => {
      // A 403 would confirm the row exists. That turns `PATCH /api/reviews/:id`
      // into an enumeration oracle: walk ids, keep the ones that answer 403, and
      // you have a map of which review ids are real without ever being allowed to
      // read one. Authorship therefore belongs in the LOOKUP, not in a check after
      // it — a row that is not yours simply is not found.
      reviewRepositoryMock.findOwnById.mockResolvedValue(null);

      await expect(
        service.updateOwnReview(USER_ID, 'someone-elses-review', { comment: 'mine now' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(reviewRepositoryMock.findOwnById).toHaveBeenCalledWith(
        'someone-elses-review',
        USER_ID,
      );
      expect(reviewRepositoryMock.updateComment).not.toHaveBeenCalled();
    });

    it('sends the edited text back to moderation', async () => {
      reviewRepositoryMock.findOwnById.mockResolvedValue(
        makeReview({ comment: null, textStatus: ReviewTextStatus.PENDING }),
      );
      reviewRepositoryMock.updateComment.mockResolvedValue(
        makeReview({ comment: 'Added a week later', textStatus: ReviewTextStatus.PENDING }),
      );

      const result = await service.updateOwnReview(USER_ID, 'review-uuid-1', {
        comment: 'Added a week later',
      });

      expect(reviewRepositoryMock.updateComment).toHaveBeenCalledWith(
        'review-uuid-1',
        'Added a week later',
      );
      expect(result.comment).toBe('Added a week later');
      expect(result.textStatus).toBe(ReviewTextStatus.PENDING);
    });

    it('never asks the repository to touch the rating', async () => {
      // The rating is a one-shot act (owner's decision 5 covers the TEXT only).
      // Letting an edit move it would reopen exactly the abuse surface the whole
      // task exists to close: rate five stars, wait for the average to move, edit
      // to one. The service must not even have the words to ask.
      reviewRepositoryMock.findOwnById.mockResolvedValue(makeReview({ rating: 5 }));
      reviewRepositoryMock.updateComment.mockResolvedValue(makeReview({ rating: 5 }));

      await service.updateOwnReview(USER_ID, 'review-uuid-1', { comment: 'still great' });

      const args = reviewRepositoryMock.updateComment.mock.calls[0];
      expect(args).toEqual(['review-uuid-1', 'still great']);
    });

    it('treats an absent comment as no edit at all, rather than as an erasure', async () => {
      // `{}` is what a half-wired form sends. Reading it as «clear the text» would
      // wipe a published comment AND drop it back into the moderation queue, and
      // the author would have no copy of what they wrote.
      const existing = makeReview({
        comment: 'Published months ago',
        textStatus: ReviewTextStatus.APPROVED,
      });
      reviewRepositoryMock.findOwnById.mockResolvedValue(existing);

      const result = await service.updateOwnReview(USER_ID, 'review-uuid-1', {});

      expect(reviewRepositoryMock.updateComment).not.toHaveBeenCalled();
      expect(result.comment).toBe('Published months ago');
      expect(result.textStatus).toBe(ReviewTextStatus.APPROVED);
    });
  });

  // ─── replyToReview (TASK-587) ───────────────────────────────────────────────
  //
  // Owner's decision, 2026-09-14: only the SHOP replies, anyone holding
  // `reviews:write` may write on its behalf, there is no author thread, and the
  // customer byline stays «Покупець».

  describe('replyToReview', () => {
    it('throws NotFoundException when the review does not exist', async () => {
      reviewRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.replyToReview('missing', 'staff-uuid-1', { body: 'Дякуємо!' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(reviewRepositoryMock.upsertReply).not.toHaveBeenCalled();
    });

    it('records WHO at the shop wrote it', async () => {
      // Accountability, not attribution: the customer is answered by the shop, but
      // somebody has to be answerable internally for what the shop said.
      reviewRepositoryMock.findById.mockResolvedValue(makeReview());
      reviewRepositoryMock.upsertReply.mockResolvedValue(makeReply());

      await service.replyToReview('review-uuid-1', 'staff-uuid-1', { body: 'Дякуємо!' });

      expect(reviewRepositoryMock.upsertReply).toHaveBeenCalledWith(
        'review-uuid-1',
        'staff-uuid-1',
        'Дякуємо!',
      );
    });

    it('returns the text and the date, and nothing that names a person', async () => {
      // The storefront renders the SHOP. Leaking `authorUserId` here is how a
      // later "improvement" ends up putting an employee's name under a review.
      reviewRepositoryMock.findById.mockResolvedValue(makeReview());
      reviewRepositoryMock.upsertReply.mockResolvedValue(makeReply());

      const result = await service.replyToReview('review-uuid-1', 'staff-uuid-1', {
        body: 'Дякуємо!',
      });

      expect(result.body).toBe('Дякуємо! Передали ваш відгук виробнику.');
      expect(result.createdAt).toEqual(now);
      expect(result).not.toHaveProperty('authorUserId');
      expect(result).not.toHaveProperty('authorUser');
    });
  });

  // ─── the reply on the read paths (TASK-587) ─────────────────────────────────

  describe('the shop reply as customers and moderators see it', () => {
    it('hangs the reply under the review on the public list', async () => {
      reviewRepositoryMock.findApprovedByProduct.mockResolvedValue({
        reviews: [{ ...makeReview({ textStatus: ReviewTextStatus.APPROVED }), reply: makeReply() }],
        total: 1,
      });
      reviewRepositoryMock.aggregate.mockResolvedValue({ ratingAverage: 5, ratingCount: 1 });
      reviewRepositoryMock.findVerifiedPurchaserIds.mockResolvedValue(new Set<string>());

      const result = await service.getApprovedReviews(PRODUCT_ID, {});

      expect(result.data[0].reply).toEqual({
        body: 'Дякуємо! Передали ваш відгук виробнику.',
        createdAt: now,
      });
    });

    it('says null rather than omitting the field when nobody has answered', async () => {
      // An absent key and an explicit null read the same in JSON but not in
      // TypeScript, and the storefront branches on this to decide whether to
      // render the reply block at all.
      reviewRepositoryMock.findApprovedByProduct.mockResolvedValue({
        reviews: [{ ...makeReview({ textStatus: ReviewTextStatus.APPROVED }), reply: null }],
        total: 1,
      });
      reviewRepositoryMock.aggregate.mockResolvedValue({ ratingAverage: 5, ratingCount: 1 });
      reviewRepositoryMock.findVerifiedPurchaserIds.mockResolvedValue(new Set<string>());

      const result = await service.getApprovedReviews(PRODUCT_ID, {});

      expect(result.data[0].reply).toBeNull();
    });

    it('shows the moderation queue what was already answered', async () => {
      // Without it the panel offers "reply" on rows that already carry one, and an
      // operator working a backlog silently overwrites a colleague's answer.
      reviewRepositoryMock.findForModeration.mockResolvedValue({
        reviews: [
          {
            ...makeReview(),
            user: { email: 'olena@example.com' },
            product: { name: 'Чохол', sku: 'CASE-1' },
            reply: makeReply(),
          },
        ],
        total: 1,
      });

      const result = await service.getReviewsForModeration({});

      expect(result.data[0].reply).toEqual({
        body: 'Дякуємо! Передали ваш відгук виробнику.',
        createdAt: now,
      });
    });
  });
});
