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
      // TASK-587: and whatever the shop has already answered. Without it the
      // panel offers "reply" on every row, including the ones that carry one, and
      // an operator working a backlog overwrites a colleague's answer having
      // never seen it.
      reply: true,
    });
  });

  it('filters on the TEXT status alone when no term is given', async () => {
    await repo.findForModeration('pending', 1, 20);

    expect(issuedWhere()).toEqual({ textStatus: 'PENDING' });
    // The COUNT must carry the same `where`, or the pager claims pages the list
    // cannot show.
    expect(reviewCount).toHaveBeenCalledWith({ where: { textStatus: 'PENDING' } });
  });

  // TASK-585: the queue's third tab. Rejecting no longer deletes, so there is now
  // a population of REJECTED rows that exists and was previously unreachable —
  // without this arm a moderator cannot see, or undo, anything they turned down.
  it('reaches the rejected pile, which is a population now that reject does not delete', async () => {
    await repo.findForModeration('rejected', 1, 20);

    expect(issuedWhere()).toEqual({ textStatus: 'REJECTED' });
    expect(reviewCount).toHaveBeenCalledWith({ where: { textStatus: 'REJECTED' } });
  });

  it('ORs the term across review text, author email and product name', async () => {
    await repo.findForModeration('approved', 1, 20, 'чохол');

    expect(issuedWhere()).toEqual({
      textStatus: 'APPROVED',
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

/**
 * The rating/text split (TASK-585) — the two read paths that used to share one
 * `isActive` flag and must now diverge.
 *
 * Prisma is mocked, so what is pinned is the WHERE SHAPE, and that is the whole
 * risk: both failures are silent on screen. An aggregate that still filters on the
 * text status quietly refuses to count a rating the owner decided counts
 * immediately; a public list that filters on `ratingVisible` instead of the text
 * status starts publishing unmoderated comments.
 */
describe('ReviewRepository — rating aggregate vs public text list (TASK-585)', () => {
  let repo: ReviewRepository;

  const reviewFindMany = jest.fn();
  const reviewCount = jest.fn();
  const reviewGroupBy = jest.fn();
  const reviewUpdate = jest.fn();

  const prismaMock = {
    order: { findMany: jest.fn() },
    orderItem: { findFirst: jest.fn() },
    review: {
      findMany: reviewFindMany,
      count: reviewCount,
      groupBy: reviewGroupBy,
      update: reviewUpdate,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    reviewFindMany.mockResolvedValue([]);
    reviewCount.mockResolvedValue(0);
    reviewGroupBy.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(ReviewRepository);
  });

  // ─── 1. the aggregate counts ratings, not texts ─────────────────────────────

  it('counts EVERY visible rating, whether or not its text was approved', async () => {
    // The owner's decision of 2026-09-10: stars count the moment they are given.
    // A three-star rating whose comment is still in the moderation queue is part
    // of the product's average today, not whenever someone gets round to reading
    // the sentence next to it.
    reviewGroupBy.mockResolvedValue([
      { productId: 'product-1', _avg: { rating: 4.5 }, _count: { rating: 8 } },
    ]);

    const result = await repo.aggregate('product-1');

    expect(reviewGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 'product-1', ratingVisible: true } }),
    );
    expect(result).toEqual({ ratingAverage: 4.5, ratingCount: 8 });
  });

  it('does not consult the text status when aggregating', async () => {
    await repo.aggregate('product-1');

    // Spelled out separately from the `toEqual` above because this is the exact
    // regression: leaving a `textStatus` arm in the aggregate would still produce
    // a plausible-looking average — just the OLD one.
    expect(reviewGroupBy.mock.calls[0][0].where).not.toHaveProperty('textStatus');
  });

  it('reports no rating at all rather than zero when the product has none', async () => {
    reviewGroupBy.mockResolvedValue([]);

    expect(await repo.aggregate('product-1')).toEqual({ ratingAverage: null, ratingCount: 0 });
  });

  // ─── 2. the public list shows approved TEXTS ────────────────────────────────

  it('lists only approved texts, and only rows that actually have one', async () => {
    await repo.findApprovedByProduct('product-1', 1, 10);

    const where = reviewFindMany.mock.calls[0][0].where;
    expect(where).toEqual({
      productId: 'product-1',
      textStatus: 'APPROVED',
      hiddenAt: null,
      comment: { not: null },
      NOT: { comment: '' },
    });
    // A star-only row is APPROVED-able and must still never reach the list: it
    // would render as an author, a date and an empty speech bubble.
    expect(where).not.toHaveProperty('ratingVisible');
  });

  // TASK-587: the shop's answer travels with the review it answers. A second
  // round-trip per page would be the alternative, on a PUBLIC, uncached endpoint
  // that already fought off one N+1 (TASK-298).
  it('brings the shop reply along with the public list', async () => {
    await repo.findApprovedByProduct('product-1', 1, 10);

    expect(reviewFindMany.mock.calls[0][0].include).toEqual({ reply: true });
  });

  it('counts the page with the same filter, so `meta.total` matches what is shown', async () => {
    await repo.findApprovedByProduct('product-1', 1, 10);

    expect(reviewCount).toHaveBeenCalledWith({ where: reviewFindMany.mock.calls[0][0].where });
  });

  // ─── 3. rejecting a text leaves the rating alone ────────────────────────────

  it('rejects a TEXT by status, never by deleting the row', async () => {
    reviewUpdate.mockResolvedValue({ id: 'review-1' });

    await repo.rejectText('review-1');

    expect(reviewUpdate).toHaveBeenCalledWith({
      where: { id: 'review-1' },
      data: { textStatus: 'REJECTED' },
    });
    // Neither the rating nor its visibility may appear in the update: a moderator
    // turning down a sentence must not move the product's score.
    const written = reviewUpdate.mock.calls[0][0].data;
    expect(written).not.toHaveProperty('rating');
    expect(written).not.toHaveProperty('ratingVisible');
  });
});

/**
 * Bulk moderation (TASK-585) — the per-row buttons applied to a selection.
 *
 * `reject` used to `deleteMany`. It now writes a status, which is the difference
 * between an operator clearing a backlog and an operator destroying an unknown
 * number of ratings.
 */
describe('ReviewRepository — moderateMany writes statuses, never deletes', () => {
  let repo: ReviewRepository;

  const txFindMany = jest.fn();
  const txUpdateMany = jest.fn();
  const txDeleteMany = jest.fn();
  const tx = {
    review: { findMany: txFindMany, updateMany: txUpdateMany, deleteMany: txDeleteMany },
  };

  const prismaMock = {
    order: { findMany: jest.fn() },
    orderItem: { findFirst: jest.fn() },
    review: {},
    $transaction: jest.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    txUpdateMany.mockResolvedValue({ count: 2 });
    txDeleteMany.mockResolvedValue({ count: 2 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(ReviewRepository);
  });

  it('rejects a batch by setting REJECTED — the ratings survive', async () => {
    txFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    const count = await repo.moderateMany(['a', 'b'], 'reject');

    expect(txDeleteMany).not.toHaveBeenCalled();
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      data: { textStatus: 'REJECTED' },
    });
    expect(count).toBe(2);
  });

  it('approves a batch by setting APPROVED', async () => {
    txFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    await repo.moderateMany(['a', 'b'], 'approve');

    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      data: { textStatus: 'APPROVED' },
    });
  });

  it('still aborts the whole batch on an unknown id', async () => {
    txFindMany.mockResolvedValue([{ id: 'a' }]);

    await expect(repo.moderateMany(['a', 'gone'], 'reject')).rejects.toThrow(/gone/);
    expect(txUpdateMany).not.toHaveBeenCalled();
  });
});

/**
 * The author's own row (TASK-586) — the two lookups and the one write behind
 * «дописати текст до вже поставленої оцінки» (owner's decision 5).
 *
 * Prisma is mocked, so what is pinned is the WHERE SHAPE, and here that shape IS
 * the authorisation. `findOwnById` carries the author id as a FILTER rather than
 * fetching the row and comparing afterwards; drop that arm and the endpoint
 * happily lets anyone rewrite anyone's review, with nothing on screen to show for
 * it.
 */
describe("ReviewRepository — the author's own review (TASK-586)", () => {
  let repo: ReviewRepository;

  const reviewFindFirst = jest.fn();
  const reviewUpdate = jest.fn();

  const prismaMock = {
    order: { findMany: jest.fn() },
    orderItem: { findFirst: jest.fn() },
    review: { findFirst: reviewFindFirst, update: reviewUpdate },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    reviewFindFirst.mockResolvedValue(null);
    reviewUpdate.mockResolvedValue({ id: 'review-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(ReviewRepository);
  });

  it('finds the caller’s own row for a product, and skips a hidden one', async () => {
    await repo.findOwnByProduct('user-1', 'product-1');

    expect(reviewFindFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', productId: 'product-1', hiddenAt: null },
    });
  });

  it('scopes the by-id lookup to the author, so a stranger finds nothing', async () => {
    await repo.findOwnById('review-1', 'user-1');

    expect(reviewFindFirst).toHaveBeenCalledWith({
      where: { id: 'review-1', userId: 'user-1', hiddenAt: null },
    });
  });

  it('writes the new text and sends it back to moderation, touching nothing else', async () => {
    await repo.updateComment('review-1', 'Added a week later');

    expect(reviewUpdate).toHaveBeenCalledWith({
      where: { id: 'review-1' },
      data: { comment: 'Added a week later', textStatus: 'PENDING' },
    });
    // An edit is a statement about the TEXT. A `rating` or `ratingVisible` in this
    // payload would let an author move the product's score from a comment box.
    const written = reviewUpdate.mock.calls[0][0].data;
    expect(written).not.toHaveProperty('rating');
    expect(written).not.toHaveProperty('ratingVisible');
    expect(written).not.toHaveProperty('hiddenAt');
  });
});

/**
 * The shop's reply (TASK-587) — one per review, by the schema's `@unique` on
 * `ReviewReply.reviewId` and by the owner's decision that there is no thread.
 *
 * The write is an UPSERT for a plain reason: fixing a typo in a published answer
 * is a real need, and `create` would answer it with a unique-constraint error at
 * best, or a second row at worst. A second row is not a lesser feature — it is a
 * review with two shop answers and no rule about which one renders.
 */
describe('ReviewRepository — the shop replies once (TASK-587)', () => {
  let repo: ReviewRepository;

  const replyUpsert = jest.fn();

  const prismaMock = {
    order: { findMany: jest.fn() },
    orderItem: { findFirst: jest.fn() },
    review: {},
    reviewReply: { upsert: replyUpsert },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    replyUpsert.mockResolvedValue({ id: 'reply-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(ReviewRepository);
  });

  it('upserts on the review id, so posting again REPLACES the answer', async () => {
    await repo.upsertReply('review-1', 'staff-1', 'Дякуємо!');

    expect(replyUpsert).toHaveBeenCalledWith({
      where: { reviewId: 'review-1' },
      create: { reviewId: 'review-1', authorUserId: 'staff-1', body: 'Дякуємо!' },
      update: { authorUserId: 'staff-1', body: 'Дякуємо!' },
    });
  });

  it('re-attributes a corrected answer to whoever corrected it', async () => {
    // The `update` arm carries `authorUserId` deliberately: after an edit, the
    // person answerable for the words on screen is the one who wrote THOSE words,
    // not whoever opened the thread.
    await repo.upsertReply('review-1', 'second-staffer', 'Уточнення.');

    expect(replyUpsert.mock.calls[0][0].update).toEqual({
      authorUserId: 'second-staffer',
      body: 'Уточнення.',
    });
  });
});
