import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { hashStr } from '../lib/ids';

/**
 * Seed approved product reviews so the storefront can render real star
 * ratings. Creates a pool of reviewer accounts and assigns each product a
 * deterministic, high-skewed set of ratings (believable 4.x averages with
 * some variance). Idempotent via the (userId, productId) unique constraint.
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

  const products = await prisma.product.findMany({ select: { id: true, slug: true } });

  let reviewCount = 0;
  for (const product of products) {
    // 5..16 reviews per product, stable per slug.
    const count = 5 + (hashStr(product.slug) % (reviewers.length - 4));
    for (let i = 0; i < count; i++) {
      const reviewer = reviewers[i];
      // Ratings skew positive (mostly 4–5) with occasional lower scores.
      const r = hashStr(`${product.slug}:${i}`) % 100;
      const rating = r < 55 ? 5 : r < 80 ? 4 : r < 93 ? 3 : r < 98 ? 2 : 1;
      await prisma.review.upsert({
        where: { userId_productId: { userId: reviewer.id, productId: product.id } },
        update: { rating, isActive: true },
        create: {
          userId: reviewer.id,
          productId: product.id,
          rating,
          isActive: true,
        },
      });
      reviewCount++;
    }
  }

  // ── Pending (isActive: false) reviews for the admin moderation queue ──
  // Use DEDICATED reviewer accounts (separate from reviewer1..20 above) so the
  // (userId, productId) pairs never collide with the approved loop, which would
  // otherwise flip an approved review back to pending. UA comments so the
  // moderation screen shows realistic content.
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

  const pendingComments = [
    'Чудовий товар, прийшов швидко. Рекомендую!',
    'Все сподобалось, якість на висоті.',
    'Товар відповідає опису, дякую магазину.',
    'Нормально, але очікував трохи кращого пакування.',
    'Користуюсь тиждень — поки все влаштовує.',
    'Ціна виправдана, буду замовляти ще.',
  ];

  let pendingCount = 0;
  // Attach pending reviews to the first few products so the queue is populated.
  const pendingTargets = products.slice(0, pendingComments.length);
  for (let i = 0; i < pendingTargets.length; i++) {
    const product = pendingTargets[i];
    const reviewer = pendingReviewers[i % pendingReviewers.length];
    const rating = 3 + (hashStr(`pending:${product.slug}`) % 3); // 3..5
    await prisma.review.upsert({
      where: { userId_productId: { userId: reviewer.id, productId: product.id } },
      update: { rating, comment: pendingComments[i], isActive: false },
      create: {
        userId: reviewer.id,
        productId: product.id,
        rating,
        comment: pendingComments[i],
        isActive: false,
      },
    });
    pendingCount++;
  }

  console.log(
    `  ✓ Reviews: ${reviewCount} approved + ${pendingCount} pending across ${products.length} products`,
  );
}
