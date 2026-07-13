import { Test, TestingModule } from '@nestjs/testing';
import { ReviewRepository } from './review.repository';
import { PrismaService } from '../prisma';

/**
 * Unit tests for the BATCHED verified-purchase lookup (TASK-298) — the replacement for the
 * per-review `isVerifiedPurchase` fan-out in `ReviewService.getApprovedReviews`. Prisma is
 * mocked, so what is under test is the query shape (one call, distinct authors) and the
 * empty-input short-circuit.
 */
describe('ReviewRepository — findVerifiedPurchaserIds', () => {
  let repo: ReviewRepository;

  const orderFindMany = jest.fn();
  const orderItemFindFirst = jest.fn();

  const prismaMock = {
    order: { findMany: orderFindMany },
    orderItem: { findFirst: orderItemFindFirst },
    review: {},
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(ReviewRepository);
  });

  it('resolves the whole page of authors in ONE query and returns only the buyers', async () => {
    orderFindMany.mockResolvedValue([{ userId: 'buyer' }]);

    const verified = await repo.findVerifiedPurchaserIds('product-1', ['buyer', 'non-buyer']);

    expect(orderFindMany).toHaveBeenCalledTimes(1);
    expect(orderFindMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ['buyer', 'non-buyer'] },
        items: { some: { productId: 'product-1' } },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    expect(verified.has('buyer')).toBe(true);
    expect(verified.has('non-buyer')).toBe(false);
    expect(verified.size).toBe(1);
  });

  it('short-circuits an empty author list without touching the database', async () => {
    const verified = await repo.findVerifiedPurchaserIds('product-1', []);

    expect(verified.size).toBe(0);
    expect(orderFindMany).not.toHaveBeenCalled();
  });
});
