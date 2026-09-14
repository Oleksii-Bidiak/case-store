import type { PrismaClient } from '@prisma/client';
import { orderSpecs } from '../data/orders.data';
import { buildVerifiedPurchaseReviews } from '../lib/verified-purchase-reviews';
import { seedReviews, PENDING_REVIEW_TARGETS } from './reviews.seeder';

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

/** Every product the seeder demands: the six queue targets plus the bought SKUs. */
const products = [
  ...PENDING_REVIEW_TARGETS.map((target, i) => ({
    id: `product-${i}`,
    slug: target.slug,
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

  const prisma = {
    user: { upsert: userUpsert, findMany: userFindMany },
    product: { findMany: jest.fn() },
    review: { deleteMany: jest.fn(), createMany: reviewCreateMany },
  };

  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    userUpsert.mockImplementation((args: UpsertArgs) => ({ id: args.where.email }));
    prisma.product.findMany.mockResolvedValue(products);
    prisma.review.deleteMany.mockResolvedValue({ count: 0 });
    reviewCreateMany.mockResolvedValue({ count: 0 });
    userFindMany.mockResolvedValue(
      [...new Set(verifiedSpecs.map((spec) => spec.email))].map((email) => ({
        id: `buyer:${email}`,
        email,
      })),
    );

    await seedReviews(prisma as unknown as PrismaClient);
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

  it('still seeds exactly the rows it always did', () => {
    // The stamp is the only change: this seeder decides what the whole
    // storefront's ratings look like, and "while I was here" is how a catalogue
    // quietly changes shape.
    const pool = reviewCreateMany.mock.calls[0][0].data as { ratingVisible: boolean }[];
    const verified = reviewCreateMany.mock.calls[1][0].data as { ratingVisible: boolean }[];

    expect(verified).toHaveLength(verifiedSpecs.length);
    expect(pool.every((row) => row.ratingVisible === true)).toBe(true);
    expect(
      pool.filter((row) => (row as { textStatus: string }).textStatus === 'PENDING'),
    ).toHaveLength(PENDING_REVIEW_TARGETS.length);
  });
});
