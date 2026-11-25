import type { PrismaClient } from '@prisma/client';
import {
  ONE_STAR_RUN_THRESHOLD,
  RATING_BURST_THRESHOLD,
} from '../../../src/dashboard/dashboard.types';
import { orderSpecs } from '../data/orders.data';
import { buildVerifiedPurchaseReviews } from '../lib/verified-purchase-reviews';
import { seedReviews, PENDING_REVIEW_TARGETS, REVIEW_STATES } from './reviews.seeder';

/**
 * The seeded reviewer accounts must carry a CONFIRMED address (TASK-588).
 *
 * ## Why this is worth a test of its own
 *
 * Since TASK-588 a rating counts only while its author's `emailVerifiedAt` is
 * stamped, and the seeded reviewers have never confirmed anything — they are
 * `prisma.user.upsert`ed straight into the table. Leave them unstamped and the
 * next `db:seed` writes ~2 200 ratings that are all invisible to the aggregate:
 * every one of the 178 catalogue positions loses its stars at once, on a
 * database nobody has changed and in a run that prints «✓ Reviews: …» and exits
 * zero. The rows are there; the shop simply has no ratings any more.
 *
 * ## Why the UPDATE arm matters as much as the CREATE arm
 *
 * These accounts already exist on every developer database, so the create arm
 * never runs there. An `update: {}` would leave exactly those machines — the
 * ones that seed most often — with the bug, while a fresh database looked fine.
 *
 * Prisma is mocked: this is about what the seeder WRITES, and a real database
 * would test nothing here that the assertions below do not.
 */

const verifiedSpecs = buildVerifiedPurchaseReviews(orderSpecs);

/** Every product the seeder demands: the queue and moderation targets plus the bought SKUs. */
const targetSlugs = [
  ...new Set([
    ...PENDING_REVIEW_TARGETS.map((target) => target.slug),
    ...REVIEW_STATES.rejected.map((target) => target.slug),
    ...REVIEW_STATES.replies.map((target) => target.slug),
    REVIEW_STATES.burst.slug,
    ...REVIEW_STATES.oneStarRun.slugs,
  ]),
];
const products = [
  ...targetSlugs.map((slug, i) => ({
    id: `product-${i}`,
    slug,
    sku: `SKU-TARGET-${i}`,
  })),
  ...[...new Set(verifiedSpecs.map((spec) => spec.sku))].map((sku, i) => ({
    id: `bought-${i}`,
    slug: `bought-${i}`,
    sku,
  })),
];

interface UpsertArgs {
  where: { email: string };
  update: Record<string, unknown>;
  create: Record<string, unknown>;
}

describe('seedReviews — the seeded reviewers are confirmed accounts (TASK-588)', () => {
  const userUpsert = jest.fn();
  const userFindMany = jest.fn();
  const reviewCreateMany = jest.fn();
  const reviewUpdate = jest.fn();
  const reviewUpdateMany = jest.fn();
  const replyUpsert = jest.fn();
  const staff = { owner: { id: 'owner-id' }, content: { id: 'content-id' } };

  const prisma = {
    user: { upsert: userUpsert, findMany: userFindMany },
    product: { findMany: jest.fn() },
    review: {
      deleteMany: jest.fn(),
      createMany: reviewCreateMany,
      // A review's id is its (author, product) pair — enough to follow it here.
      findUnique: jest.fn(
        ({ where }: { where: { userId_productId: { userId: string; productId: string } } }) => ({
          id: `${where.userId_productId.userId}|${where.userId_productId.productId}`,
        }),
      ),
      update: reviewUpdate,
      updateMany: reviewUpdateMany,
    },
    reviewReply: { upsert: replyUpsert },
    $transaction: (fn: (tx: unknown) => unknown) => fn(prisma),
  };

  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    userUpsert.mockImplementation((args: UpsertArgs) => ({ id: args.where.email }));
    prisma.product.findMany.mockResolvedValue(products);
    prisma.review.deleteMany.mockResolvedValue({ count: 0 });
    reviewCreateMany.mockResolvedValue({ count: 0 });
    reviewUpdate.mockResolvedValue({});
    reviewUpdateMany.mockResolvedValue({ count: 3 });
    replyUpsert.mockResolvedValue({});
    userFindMany.mockResolvedValue(
      [...new Set(verifiedSpecs.map((spec) => spec.email))].map((email) => ({
        id: `buyer:${email}`,
        email,
      })),
    );

    await seedReviews(prisma as unknown as PrismaClient, staff);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  /** The upsert calls for the 20 approved + 3 moderation-queue reviewers. */
  const reviewerUpserts = (): UpsertArgs[] =>
    userUpsert.mock.calls.map((call) => call[0] as UpsertArgs);

  it('creates every reviewer account with its address already proven', () => {
    const calls = reviewerUpserts();

    expect(calls).toHaveLength(23);
    for (const call of calls) {
      expect(call.create.emailVerifiedAt).toBeInstanceOf(Date);
    }
  });

  it('stamps accounts that already exist, so a re-seed repairs them', () => {
    for (const call of reviewerUpserts()) {
      expect(call.update.emailVerifiedAt).toBeInstanceOf(Date);
    }
  });

  it('gives a share of the pool a text, so the reviews tab is not empty', () => {
    // TASK-598. Before the split the public list filtered on `isActive` alone, so
    // these comment-less rows all rendered — as an author, a date and an empty
    // bubble. Excluding them was right; leaving nothing in their place was not.
    // A fresh seed showed «4.6 · 12 оцінок» above an EMPTY reviews tab on 173 of
    // 178 positions, which reads as a broken feature.
    const pool = reviewCreateMany.mock.calls[0][0].data as {
      productId: string;
      comment?: string;
    }[];

    const withText = pool.filter((row) => row.comment);
    expect(withText.length).toBeGreaterThan(0);

    // And not all of them: a rating count legitimately larger than the review
    // count is the very thing this split exists to make visible, so the seed has
    // to produce both numbers.
    expect(withText.length).toBeLessThan(pool.length);

    // Every product carries at least one, or the empty tab merely moves to a
    // different position rather than going away.
    const productsWithText = new Set(withText.map((row) => row.productId));
    expect(productsWithText.size).toBe(new Set(pool.map((row) => row.productId)).size);
  });

  it('still seeds exactly the rows it always did', () => {
    // The stamp is the only change: this seeder decides what the whole
    // storefront's ratings look like, and "while I was here" is how a catalogue
    // quietly changes shape.
    const pool = reviewCreateMany.mock.calls[0][0].data as {
      ratingVisible: boolean;
      textStatus: string;
    }[];
    const verified = reviewCreateMany.mock.calls[1][0].data as { ratingVisible: boolean }[];

    expect(verified).toHaveLength(verifiedSpecs.length);
    expect(pool.every((row) => row.ratingVisible === true)).toBe(true);
    // The six queue items, plus the two texts that enter the queue and are then
    // rejected (TASK-2569) — so the queue an operator opens still holds six.
    expect(pool.filter((row) => row.textStatus === 'PENDING')).toHaveLength(
      PENDING_REVIEW_TARGETS.length + REVIEW_STATES.rejected.length,
    );
    const rejected = reviewUpdate.mock.calls.map(
      (call) => call[0] as { data: { textStatus: string } },
    );
    expect(rejected).toHaveLength(REVIEW_STATES.rejected.length);
    expect(rejected.every((call) => call.data.textStatus === 'REJECTED')).toBe(true);
  });
});

describe('seedReviews — moderation and abuse states (TASK-2569)', () => {
  type Row = {
    userId: string;
    productId: string;
    rating: number;
    createdAt: Date;
    createdIp?: string;
  };
  const reviewCreateMany = jest.fn().mockResolvedValue({ count: 0 });
  const reviewUpdateMany = jest.fn().mockResolvedValue({ count: 3 });
  const replyUpsert = jest.fn().mockResolvedValue({});
  const prisma = {
    user: {
      upsert: jest.fn((args: UpsertArgs) => ({ id: args.where.email })),
      findMany: jest.fn().mockResolvedValue(
        [...new Set(verifiedSpecs.map((spec) => spec.email))].map((email) => ({
          id: `buyer:${email}`,
          email,
        })),
      ),
    },
    product: { findMany: jest.fn().mockResolvedValue(products) },
    review: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: reviewCreateMany,
      findUnique: jest.fn(
        ({ where }: { where: { userId_productId: { userId: string; productId: string } } }) => ({
          id: `${where.userId_productId.userId}|${where.userId_productId.productId}`,
        }),
      ),
      update: jest.fn().mockResolvedValue({}),
      updateMany: reviewUpdateMany,
    },
    reviewReply: { upsert: replyUpsert },
    $transaction: (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  const started = Date.now();
  let pool: Row[] = [];

  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await seedReviews(prisma as unknown as PrismaClient, {
      owner: { id: 'owner-id' },
      content: { id: 'content-id' },
    });
    pool = reviewCreateMany.mock.calls[0][0].data as Row[];
  });

  afterAll(() => jest.restoreAllMocks());

  const productIdOf = (slug: string) => products.find((p) => p.slug === slug)!.id;

  it('never gives one account two reviews of one product', () => {
    const pairs = pool.map((row) => `${row.userId}|${row.productId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('plants a burst the dashboard flags: over the threshold inside the last hour', () => {
    const recent = pool.filter(
      (row) =>
        row.productId === productIdOf(REVIEW_STATES.burst.slug) &&
        row.createdAt.getTime() > started - 60 * 60 * 1000,
    );
    expect(recent.length).toBeGreaterThan(RATING_BURST_THRESHOLD);
  });

  it('plants a 1★ run from one address on products that are not bursting', () => {
    const run = pool.filter((row) => row.createdIp === REVIEW_STATES.oneStarRun.createdIp);
    expect(run.length).toBeGreaterThanOrEqual(ONE_STAR_RUN_THRESHOLD);
    expect(run.every((row) => row.rating === 1)).toBe(true);
    expect(run.some((row) => row.productId === productIdOf(REVIEW_STATES.burst.slug))).toBe(false);
    expect(run.every((row) => row.createdAt.getTime() > started - 24 * 60 * 60 * 1000)).toBe(true);
  });

  it('hides one author the way hideAuthorReviews does — stars off, then MODERATOR', () => {
    const hiddenAuthor = `reviewer${REVIEW_STATES.hiddenAuthorIndex + 1}@store.com`;
    const writes = reviewUpdateMany.mock.calls.map(
      (call) => call[0] as { where: { userId: string }; data: Record<string, unknown> },
    );
    expect(writes.every((w) => w.where.userId === hiddenAuthor)).toBe(true);
    expect(writes[0].data).toEqual({ ratingVisible: false });
    expect(writes[1].data).toMatchObject({ hiddenReason: 'MODERATOR' });
    expect(writes[1].data.hiddenAt).toBeInstanceOf(Date);
  });

  it('answers as the owner and as the content manager', () => {
    const authors = replyUpsert.mock.calls.map(
      (call) => (call[0] as { create: { authorUserId: string } }).create.authorUserId,
    );
    expect(authors).toHaveLength(REVIEW_STATES.replies.length);
    expect(new Set(authors)).toEqual(new Set(['owner-id', 'content-id']));
  });
});
