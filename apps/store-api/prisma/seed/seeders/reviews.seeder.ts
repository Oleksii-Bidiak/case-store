import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { orderSpecs } from '../data/orders.data';
import { hashStr } from '../lib/ids';
import { buildVerifiedPurchaseReviews } from '../lib/verified-purchase-reviews';

/**
 * Six products that carry a PENDING review, so the admin moderation queue always
 * has exactly six items waiting — named explicitly, one per root category.
 *
 * The previous revision took `products.slice(0, 6)` from an **unordered**
 * `findMany`. Postgres returns heap order, which shifts as rows are updated, so
 * each seed run picked a different six products — and because the upsert key is
 * `(userId, productId)`, the previous run's pending reviews were left behind
 * rather than moved. The queue grew by six every run (six, twelve, eighteen…),
 * which is how it reached forty on a dev database, and no QA step could say «open
 * the product with the pending review» because it was never the same product.
 */
const PENDING_REVIEW_TARGETS = [
  {
    slug: 'apple-iphone-16-pro-128gb-black',
    comment: 'Чудовий товар, прийшов швидко. Рекомендую!',
  },
  { slug: 'headphones-apple-airpods-pro-2', comment: 'Все сподобалось, якість на висоті.' },
  {
    slug: 'watch-apple-series-10-42-black',
    comment: 'Товар відповідає опису, дякую магазину.',
  },
  {
    slug: 'powerbank-anker-10000-black',
    comment: 'Нормально, але очікував трохи кращого пакування.',
  },
  {
    slug: 'case-spigen-liquid-air-iphone-15-black',
    comment: 'Користуюсь тиждень — поки все влаштовує.',
  },
  { slug: 'cable-ugreen-usbc-100w-1m', comment: 'Ціна виправдана, буду замовляти ще.' },
];

/**
 * Seed approved product reviews so the storefront can render real star ratings,
 * plus a fixed moderation queue for the admin panel. Each product gets a
 * deterministic, positively-skewed set of ratings (believable 4.x averages with
 * some variance), stable for a given product slug.
 *
 * Idempotent by wholesale replacement rather than by per-row upsert: every review
 * belonging to a seeded reviewer account is deleted and re-inserted with
 * `createMany`. Two reasons. Correctness — a review whose product left the
 * catalogue is removed instead of lingering. And speed: the catalogue grew to 178
 * positions (TASK-366), which is ~2 200 reviews, and that many sequential
 * round-trips dominated the whole seed.
 *
 * Reviews written by real accounts during QA are never touched — the delete is
 * scoped to the `reviewerN@store.com` / `pending-reviewerN@store.com` ids, plus
 * the handful of verified-purchase rows described below.
 *
 * Finally (TASK-409) a few reviews are written by the CUSTOMER accounts that
 * actually placed the seeded orders, so the «Підтверджена покупка» badge has
 * something to appear on. See `lib/verified-purchase-reviews.ts` for why the
 * reviewer pool alone can never produce one.
 */
export async function seedReviews(prisma: PrismaClient) {
  const reviewerPasswordHash = await argon2.hash('Reviewer123!');

  const reviewers: { id: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const reviewer = await prisma.user.upsert({
      where: { email: `reviewer${i}@store.com` },
      update: {},
      create: {
        email: `reviewer${i}@store.com`,
        passwordHash: reviewerPasswordHash,
        firstName: 'Reviewer',
        lastName: String(i),
        role: 'CUSTOMER',
        isActive: true,
      },
    });
    reviewers.push(reviewer);
  }

  // Dedicated accounts for the moderation queue, kept separate from the approved
  // pool so the two never collide on `(userId, productId)` — which would flip an
  // approved review back to pending.
  const pendingReviewers: { id: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const reviewer = await prisma.user.upsert({
      where: { email: `pending-reviewer${i}@store.com` },
      update: {},
      create: {
        email: `pending-reviewer${i}@store.com`,
        passwordHash: reviewerPasswordHash,
        firstName: 'Модерація',
        lastName: String(i),
        role: 'CUSTOMER',
        isActive: true,
      },
    });
    pendingReviewers.push(reviewer);
  }

  const products = await prisma.product.findMany({
    select: { id: true, slug: true, sku: true },
  });
  const productIdBySlug = new Map(products.map((p) => [p.slug, p.id]));

  const missingTargets = PENDING_REVIEW_TARGETS.filter((t) => !productIdBySlug.has(t.slug));
  if (missingTargets.length) {
    throw new Error(
      `seedReviews: PENDING_REVIEW_TARGETS names position(s) that do not exist: ` +
        `${missingTargets.map((t) => t.slug).join(', ')}. Update the list when the catalogue changes.`,
    );
  }

  // Wholesale replace — see the note above.
  const seededReviewerIds = [...reviewers, ...pendingReviewers].map((r) => r.id);
  await prisma.review.deleteMany({ where: { userId: { in: seededReviewerIds } } });

  // Timestamps are set explicitly rather than left to `now()` because ordering
  // MATTERS: the public list is newest-first and paginated, so the few
  // verified-purchase reviews below have to land on page 1 of their product —
  // an invisible badge is the defect this is fixing. The DB clock and this
  // process's clock need not agree, so both batches are stamped from one clock.
  const now = Date.now();
  const poolCreatedAt = new Date(now - 60 * 60 * 1000);
  const verifiedCreatedAt = new Date(now);

  const rows: {
    userId: string;
    productId: string;
    rating: number;
    comment?: string;
    isActive: boolean;
    createdAt: Date;
  }[] = [];

  for (const product of products) {
    // 5..16 reviews per product, stable per slug.
    const count = 5 + (hashStr(product.slug) % (reviewers.length - 4));
    for (let i = 0; i < count; i++) {
      // Ratings skew positive (mostly 4–5) with occasional lower scores.
      const r = hashStr(`${product.slug}:${i}`) % 100;
      rows.push({
        userId: reviewers[i].id,
        productId: product.id,
        rating: r < 55 ? 5 : r < 80 ? 4 : r < 93 ? 3 : r < 98 ? 2 : 1,
        isActive: true,
        createdAt: poolCreatedAt,
      });
    }
  }

  const approvedCount = rows.length;

  PENDING_REVIEW_TARGETS.forEach((target, i) => {
    rows.push({
      userId: pendingReviewers[i % pendingReviewers.length].id,
      productId: productIdBySlug.get(target.slug)!,
      rating: 3 + (hashStr(`pending:${target.slug}`) % 3), // 3..5
      comment: target.comment,
      isActive: false,
      createdAt: poolCreatedAt,
    });
  });

  await prisma.review.createMany({ data: rows });

  // ─── Verified purchases (TASK-409) ────────────────────────────────────────
  //
  // Written by the CUSTOMER accounts that placed the delivered seed orders, so
  // `ReviewRepository.findVerifiedPurchaserIds()` — «has this author an order
  // line for this product?» — finally matches and the badge is visible. The
  // reviewer pool above can never satisfy it: those accounts buy nothing.
  const verifiedSpecs = buildVerifiedPurchaseReviews(orderSpecs);
  if (verifiedSpecs.length === 0) {
    throw new Error(
      'seedReviews: no verified-purchase reviews could be derived from orders.data.ts. ' +
        'The «Підтверджена покупка» badge needs at least one delivered seeded order — ' +
        'see lib/verified-purchase-reviews.ts.',
    );
  }
  const productIdBySku = new Map(
    products.flatMap((p) => (p.sku === null ? [] : [[p.sku, p.id] as const])),
  );
  const buyers = await prisma.user.findMany({
    where: { email: { in: [...new Set(verifiedSpecs.map((s) => s.email))] } },
    select: { id: true, email: true },
  });
  const buyerIdByEmail = new Map(buyers.map((u) => [u.email, u.id]));

  // Fail loudly rather than skipping a row. A silently missing verified review
  // is precisely the failure being fixed here — the badge was absent for months
  // and nothing said so. `seedOrders` already ran on the same specs, so a miss
  // means the data files have genuinely diverged.
  const verifiedRows = verifiedSpecs.map((spec) => {
    const userId = buyerIdByEmail.get(spec.email);
    const productId = productIdBySku.get(spec.sku);
    if (!userId || !productId) {
      throw new Error(
        `seedReviews: cannot attach a verified-purchase review — ` +
          `${!userId ? `unknown buyer ${spec.email}` : `unknown sku ${spec.sku}`}. ` +
          'The review targets are derived from orders.data.ts; keep the two in step.',
      );
    }
    return {
      userId,
      productId,
      rating: spec.rating,
      comment: spec.comment,
      isActive: true,
      createdAt: verifiedCreatedAt,
    };
  });

  // These rows belong to real demo accounts, so they cannot ride the reviewer
  // pool's wholesale delete. Replace exactly the `(userId, productId)` pairs
  // this seeder owns and leave every other review by those accounts — including
  // anything a tester wrote by hand — untouched.
  await prisma.review.deleteMany({
    where: {
      OR: verifiedRows.map((r) => ({ userId: r.userId, productId: r.productId })),
    },
  });
  await prisma.review.createMany({ data: verifiedRows });

  console.log(
    `  ✓ Reviews: ${approvedCount} approved + ${PENDING_REVIEW_TARGETS.length} pending across ${products.length} products`,
  );
  console.log(
    `  ✓ Verified purchases: ${verifiedRows.length} review(s) with the «Підтверджена покупка» badge ` +
      `(SKU: ${verifiedSpecs.map((s) => s.sku).join(', ')})`,
  );
}
