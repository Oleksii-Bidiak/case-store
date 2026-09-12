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

/**
 * The moderation queue's free-text search (TASK-423).
 *
 * Prisma is mocked, so what is under test is the WHERE SHAPE — which is the whole
 * risk here. The two failures this catches are both invisible on screen: an arm
 * that forgets `mode: 'insensitive'` quietly stops matching «Чохол» for `чохол`
 * (Postgres `contains` is case-SENSITIVE by default), and an unguarded empty term
 * becomes `contains: ''`, which matches every row — i.e. the search silently
 * turns into "show me everything" instead of "show me nothing".
 */
describe('ReviewRepository — findForModeration search', () => {
  let repo: ReviewRepository;

  const reviewFindMany = jest.fn();
  const reviewCount = jest.fn();

  const prismaMock = {
    order: { findMany: jest.fn() },
    orderItem: { findFirst: jest.fn() },
    review: { findMany: reviewFindMany, count: reviewCount },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    reviewFindMany.mockResolvedValue([]);
    reviewCount.mockResolvedValue(0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(ReviewRepository);
  });

  /** The `where` the page query was actually issued with. */
  function issuedWhere() {
    return reviewFindMany.mock.calls[0][0].where;
  }

  it('joins the product SKU as well as its name (TASK-430)', async () => {
    // The SKU column on the moderation queue is only as real as this select: the
    // entity would happily map `row.product.sku` to `undefined` and the panel
    // would render an empty cell for every row, with nothing failing.
    await repo.findForModeration('pending', 1, 20);

    expect(reviewFindMany.mock.calls[0][0].include).toEqual({
      user: { select: { email: true } },
      product: { select: { name: true, sku: true } },
    });
  });

  it('filters on the moderation gate alone when no term is given', async () => {
    await repo.findForModeration('pending', 1, 20);

    expect(issuedWhere()).toEqual({ isActive: false });
    // The COUNT must carry the same `where`, or the pager claims pages the list
    // cannot show.
    expect(reviewCount).toHaveBeenCalledWith({ where: { isActive: false } });
  });

  it('ORs the term across review text, author email and product name', async () => {
    await repo.findForModeration('approved', 1, 20, 'чохол');

    expect(issuedWhere()).toEqual({
      isActive: true,
      OR: [
        { comment: { contains: 'чохол', mode: 'insensitive' } },
        { user: { email: { contains: 'чохол', mode: 'insensitive' } } },
        { product: { name: { contains: 'чохол', mode: 'insensitive' } } },
      ],
    });
  });

  it('searches case-insensitively on every arm', async () => {
    await repo.findForModeration('pending', 1, 20, 'Чохол');

    for (const arm of issuedWhere().OR) {
      expect(JSON.stringify(arm)).toContain('insensitive');
    }
  });

  it('narrows the count query the same way as the page query', async () => {
    await repo.findForModeration('pending', 1, 20, 'чохол');

    expect(reviewCount).toHaveBeenCalledWith({ where: issuedWhere() });
  });

  it('adds no OR at all for an absent term', async () => {
    await repo.findForModeration('pending', 2, 50, undefined);

    expect(issuedWhere().OR).toBeUndefined();
    expect(reviewFindMany.mock.calls[0][0]).toMatchObject({ skip: 50, take: 50 });
  });
});
