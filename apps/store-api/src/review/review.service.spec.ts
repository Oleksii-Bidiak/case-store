import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma, Review } from '@prisma/client';
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
  isActive: false,
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
  approve: jest.fn(),
  delete: jest.fn(),
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

    it('creates a pending review (isActive = false) and returns the entity', async () => {
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
      expect(result.isActive).toBe(false);
      expect(result.id).toBe('review-uuid-1');
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
        reviews: [makeReview({ isActive: true })],
        total: 1,
      });
      reviewRepositoryMock.aggregate.mockResolvedValue({ ratingAverage: 5, ratingCount: 1 });
      reviewRepositoryMock.findVerifiedPurchaserIds.mockResolvedValue(new Set<string>());

      const result = await service.getApprovedReviews(PRODUCT_ID, {});

      expect(reviewRepositoryMock.findApprovedByProduct).toHaveBeenCalledWith(PRODUCT_ID, 1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].isActive).toBe(true);
      expect(result.aggregate.ratingAverage).toBe(5);
      expect(result.aggregate.ratingCount).toBe(1);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, totalPages: 1 });
    });

    // TASK-298: the badge used to be resolved with one `isVerifiedPurchase` call PER review
    // (an N+1). It is now one batched lookup for the page — the badge itself must not change.
    it('badges a MIXED page correctly from a single batched lookup (no per-review query)', async () => {
      const buyer = 'user-buyer';
      const nonBuyer = 'user-non-buyer';
      reviewRepositoryMock.findApprovedByProduct.mockResolvedValue({
        reviews: [
          makeReview({ id: 'r-buyer', userId: buyer, isActive: true }),
          makeReview({ id: 'r-non-buyer', userId: nonBuyer, isActive: true }),
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
            product: { name: 'iPhone 15 Pro Case' },
          },
        ],
        total: 1,
      });

      const result = await service.getReviewsForModeration({});

      expect(reviewRepositoryMock.findForModeration).toHaveBeenCalledWith('pending', 1, 10);
      expect(result.data[0].userEmail).toBe('olena@example.com');
      expect(result.data[0].productName).toBe('iPhone 15 Pro Case');
      expect(result.meta.total).toBe(1);
    });

    it('passes the approved status through to the repository', async () => {
      reviewRepositoryMock.findForModeration.mockResolvedValue({ reviews: [], total: 0 });

      await service.getReviewsForModeration({ status: ReviewModerationStatus.APPROVED });

      expect(reviewRepositoryMock.findForModeration).toHaveBeenCalledWith('approved', 1, 10);
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
      reviewRepositoryMock.approve.mockResolvedValue(makeReview({ isActive: true }));

      const result = await service.approveReview('review-uuid-1');

      expect(reviewRepositoryMock.approve).toHaveBeenCalledWith('review-uuid-1');
      expect(result.isActive).toBe(true);
    });
  });

  // ─── rejectReview ─────────────────────────────────────────────────────────────

  describe('rejectReview', () => {
    it('throws NotFoundException when the review does not exist', async () => {
      reviewRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.rejectReview('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(reviewRepositoryMock.delete).not.toHaveBeenCalled();
    });

    it('hard-deletes the review when it exists', async () => {
      reviewRepositoryMock.findById.mockResolvedValue(makeReview());
      reviewRepositoryMock.delete.mockResolvedValue(undefined);

      await service.rejectReview('review-uuid-1');

      expect(reviewRepositoryMock.delete).toHaveBeenCalledWith('review-uuid-1');
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

    it('passes reject through as reject — it is a delete, not an inverse approve', async () => {
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

    it('logs the destructive path with its count — this is the only record of a bulk delete', async () => {
      reviewRepositoryMock.moderateMany.mockResolvedValue(5);

      await service.moderateMany(['a', 'b', 'c', 'd', 'e'], 'reject');

      expect(pinoLoggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'reject', count: 5 }),
        expect.stringContaining('deleted'),
      );
    });
  });
});
