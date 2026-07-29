import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { hashStr } from '../lib/ids';

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
 * scoped to the `reviewerN@store.com` / `pending-reviewerN@store.com` ids.
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

  const products = await prisma.product.findMany({ select: { id: true, slug: true } });
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

  const rows: {
    userId: string;
    productId: string;
    rating: number;
    comment?: string;
    isActive: boolean;
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
    });
  });

  await prisma.review.createMany({ data: rows });

  console.log(
    `  ✓ Reviews: ${approvedCount} approved + ${PENDING_REVIEW_TARGETS.length} pending across ${products.length} products`,
  );
}
