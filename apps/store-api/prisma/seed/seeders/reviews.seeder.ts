import { PrismaClient, ReviewHiddenReason, ReviewTextStatus } from '@prisma/client';
import argon2 from 'argon2';
import { orderSpecs } from '../data/orders.data';
import {
  ONE_STAR_RUN_THRESHOLD,
  ONE_STAR_RUN_WINDOW_HOURS,
  RATING_BURST_THRESHOLD,
  RATING_BURST_WINDOW_HOURS,
  ReviewRepository,
} from '../lib/domain';
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
export const PENDING_REVIEW_TARGETS = [
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
 * Moderation and abuse states on top of the pool (TASK-2569). Every row is
 * written by a pool account, so the wholesale delete below covers it and a
 * re-seed rebuilds the same set; replies cascade with their review and are
 * written again after it.
 *
 * - `rejected` — the first pool review of each product (always a text) gets this
 *   text instead, enters as PENDING and is rejected by the domain's
 *   `rejectText`: the text leaves, the rating stays.
 * - `replies` — the shop answers the first pool review of each product through
 *   the domain's `upsertReply`, as the owner or the content manager.
 * - `hiddenAuthorIndex` — every review of that pool account is withdrawn by the
 *   domain's `hideAuthorReviews(…, MODERATOR)`.
 * - `burst` — extra rating-only 5★ rows on one product from pool accounts not
 *   yet on it, all inside the last quarter-hour: more than
 *   `RATING_BURST_THRESHOLD` in `RATING_BURST_WINDOW_HOURS`, so the dashboard
 *   flags the product for about 45 minutes after the seed — seed on the day.
 * - `oneStarRun` — 1★ rating-only rows from ONE account and ONE address on
 *   products that are not bursting, inside `ONE_STAR_RUN_WINDOW_HOURS`.
 */
export const REVIEW_STATES = {
  rejected: [
    {
      slug: 'samsung-galaxy-s24-128gb-black',
      comment: 'Пишіть у телеграм @deshevo_phones — продам такий самий на 30% дешевше.',
    },
    {
      slug: 'headphones-apple-airpods-pro-2',
      comment: 'Купуйте на сайті конкурента, там дешевше, посилання в профілі!!!',
    },
  ],
  replies: [
    {
      slug: 'apple-iphone-15-pro-128gb-titanium',
      author: 'owner' as const,
      body: 'Дякуємо за відгук! Раді, що покупка сподобалась, — гарного користування.',
    },
    {
      slug: 'cable-ugreen-usbc-100w-1m',
      author: 'owner' as const,
      body: 'Дякуємо, що обрали нас! Якщо будуть питання щодо товару — пишіть, допоможемо.',
    },
    {
      slug: 'powerbank-anker-10000-black',
      author: 'content' as const,
      body: 'Дякуємо, що поділилися враженнями, — такі відгуки допомагають іншим із вибором.',
    },
  ],
  hiddenAuthorIndex: 19,
  burst: { slug: 'powerbank-hoco-10000-cables', size: 12 },
  oneStarRun: {
    reviewerIndex: 17,
    // RFC 5737 documentation range: never a real customer's address.
    createdIp: '203.0.113.42',
    slugs: [
      'case-spigen-tough-armor-iphone-15-pro-gray',
      'cable-baseus-usbc-240w-1m',
      'speaker-jbl-flip-6-black',
    ],
  },
};

/** The staff accounts that answer reviews in the demo. */
export interface ReviewStaff {
  owner: { id: string };
  content: { id: string };
}

/** How many pool reviewers a product gets — 5..20, stable per slug. */
function poolSize(slug: string, reviewerCount: number): number {
  return 5 + (hashStr(slug) % (reviewerCount - 4));
}

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
/**
 * Texts for the bulk pool (TASK-598).
 *
 * Separate from `COMMENTS` in `lib/verified-purchase-reviews.ts` and deliberately
 * so: those are written from the far side of a delivery, to sit under the
 * «Підтверджена покупка» badge the demo shows off. These are ordinary catalogue
 * reviews from accounts that bought nothing, which is most of what a real
 * product page carries.
 */
const POOL_COMMENTS = [
  'Користуюся вже місяць — враження тільки позитивні.',
  'За ці гроші — чудовий варіант. Раджу.',
  'Виглядає так само, як на фото. Якість гарна.',
  'Брав для себе, потім замовив ще одну знайомим.',
  'Все влаштовує, працює без нарікань.',
  'Нормальна річ за свою ціну, очікування виправдані.',
  'Трохи не такий відтінок, як очікував, але загалом задоволений.',
  'Тримається міцно, зроблено акуратно.',
];

export async function seedReviews(prisma: PrismaClient, staff: ReviewStaff) {
  const reviewerPasswordHash = await argon2.hash('Reviewer123!');

  // Since TASK-588 a rating counts only while its author's address is proven, and
  // these accounts confirm nothing — they are written straight into the table.
  // Unstamped, the ~2 200 rows below are all invisible to the aggregate and every
  // one of the 178 catalogue positions loses its stars, on a run that still
  // prints «✓ Reviews: …» and exits zero.
  //
  // Stamped in the UPDATE arm as well as the CREATE arm, because these accounts
  // already exist on every developer database: an `update: {}` would leave
  // exactly the machines that seed most often broken, while a fresh database
  // looked perfect.
  const emailVerifiedAt = new Date();

  const reviewers: { id: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const reviewer = await prisma.user.upsert({
      where: { email: `reviewer${i}@store.com` },
      update: { emailVerifiedAt },
      create: {
        email: `reviewer${i}@store.com`,
        passwordHash: reviewerPasswordHash,
        firstName: 'Reviewer',
        lastName: String(i),
        role: 'CUSTOMER',
        isActive: true,
        emailVerifiedAt,
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
      update: { emailVerifiedAt },
      create: {
        email: `pending-reviewer${i}@store.com`,
        passwordHash: reviewerPasswordHash,
        firstName: 'Модерація',
        lastName: String(i),
        role: 'CUSTOMER',
        isActive: true,
        emailVerifiedAt,
      },
    });
    pendingReviewers.push(reviewer);
  }

  const products = await prisma.product.findMany({
    select: { id: true, slug: true, sku: true },
  });
  const productIdBySlug = new Map(products.map((p) => [p.slug, p.id]));

  const targetSlugs = [
    ...PENDING_REVIEW_TARGETS.map((t) => t.slug),
    ...REVIEW_STATES.rejected.map((t) => t.slug),
    ...REVIEW_STATES.replies.map((t) => t.slug),
    REVIEW_STATES.burst.slug,
    ...REVIEW_STATES.oneStarRun.slugs,
  ];
  const missingTargets = targetSlugs.filter((slug) => !productIdBySlug.has(slug));
  if (missingTargets.length) {
    throw new Error(
      `seedReviews: PENDING_REVIEW_TARGETS / REVIEW_STATES name position(s) that do not exist: ` +
        `${missingTargets.join(', ')}. Update the lists when the catalogue changes.`,
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

  // Since TASK-585 a seeded review needs BOTH flags set explicitly. `ratingVisible`
  // is true on every row — including the pending ones — because the rating counts
  // the moment it is given; the column default is `false`, so leaving it out would
  // seed 178 products with zero stars. The reviewer accounts above are stamped
  // confirmed (TASK-588) so this stays true of a review written by hand on top of
  // the seed, not merely of the seeded rows.
  // `textStatus` is what still separates the six queue items from the rest.
  const rows: {
    userId: string;
    productId: string;
    rating: number;
    comment?: string;
    ratingVisible: boolean;
    textStatus: ReviewTextStatus;
    createdAt: Date;
    createdIp?: string;
  }[] = [];

  const rejectedBySlug = new Map(REVIEW_STATES.rejected.map((t) => [t.slug, t.comment]));

  for (const product of products) {
    // 5..20 reviews per product, stable per slug.
    const count = poolSize(product.slug, reviewers.length);
    for (let i = 0; i < count; i++) {
      // Ratings skew positive (mostly 4–5) with occasional lower scores.
      const r = hashStr(`${product.slug}:${i}`) % 100;
      // Roughly every third row carries a text (TASK-598). Before the split the
      // public list filtered on `isActive` alone, so these comment-less rows all
      // rendered — as an author, a date and an empty bubble. Now they are
      // correctly excluded, and with nothing to replace them a freshly seeded
      // shop showed «4.6 · 12 оцінок» above an EMPTY reviews tab on 173 of 178
      // positions, which reads as a broken feature rather than a working one.
      // A share rather than all of them, because the rating count legitimately
      // exceeding the review count is exactly what the split is meant to show.
      //
      // The first row of every product is forced, so "no position has an empty
      // tab" is a property of the code rather than a lucky hash: a share alone
      // leaves it to chance for each of the 178 positions, and the one that came
      // up empty would be found by a customer, not by a test.
      const hasText = i === 0 || hashStr(`${product.slug}:text:${i}`) % 3 === 0;
      // TASK-2569: a text to be rejected arrives in the queue like any other.
      const rejectedText = i === 0 ? rejectedBySlug.get(product.slug) : undefined;
      if (rejectedText) {
        rows.push({
          userId: reviewers[i].id,
          productId: product.id,
          rating: 1 + (hashStr(`${product.slug}:rejected`) % 2), // 1..2
          comment: rejectedText,
          ratingVisible: true,
          textStatus: ReviewTextStatus.PENDING,
          createdAt: poolCreatedAt,
        });
        continue;
      }
      rows.push({
        userId: reviewers[i].id,
        productId: product.id,
        rating: r < 55 ? 5 : r < 80 ? 4 : r < 93 ? 3 : r < 98 ? 2 : 1,
        comment: hasText
          ? POOL_COMMENTS[hashStr(`${product.slug}:c:${i}`) % POOL_COMMENTS.length]
          : undefined,
        ratingVisible: true,
        textStatus: ReviewTextStatus.APPROVED,
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
      // The rating counts like any other; only the TEXT waits to be read. These six
      // are the moderation queue, not six invisible ratings.
      ratingVisible: true,
      textStatus: ReviewTextStatus.PENDING,
      createdAt: poolCreatedAt,
    });
  });

  const signalRows = buildSignalRows(products, reviewers, now);
  rows.push(...signalRows);

  await prisma.review.createMany({ data: rows });

  const moderation = await applyModeration(prisma, staff, reviewers, productIdBySlug);

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
      ratingVisible: true,
      textStatus: ReviewTextStatus.APPROVED,
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
    `  ✓ Reviews: ${approvedCount} pool + ${PENDING_REVIEW_TARGETS.length} pending across ${products.length} products`,
  );
  console.log(
    `  ✓ Review moderation: ${moderation.rejected} rejected, ${moderation.replies} shop replies, ` +
      `${moderation.hidden} hidden (one author); abuse signals: ${REVIEW_STATES.burst.size}-review burst on ` +
      `${REVIEW_STATES.burst.slug}, ${REVIEW_STATES.oneStarRun.slugs.length}× 1★ from ${REVIEW_STATES.oneStarRun.createdIp}`,
  );
  console.log(
    `  ✓ Verified purchases: ${verifiedRows.length} review(s) with the «Підтверджена покупка» badge ` +
      `(SKU: ${verifiedSpecs.map((s) => s.sku).join(', ')})`,
  );
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * The burst and the 1★ run (TASK-2569), checked against the dashboard's own
 * thresholds before anything is written. Pool accounts only, each on a product
 * it has not reviewed — the pool gives product P reviewers `0..poolSize(P)-1`,
 * so every index from `poolSize(P)` up is free — and never the hidden author,
 * whose rows no longer count.
 */
function buildSignalRows(
  products: { id: string; slug: string }[],
  reviewers: { id: string }[],
  now: number,
) {
  const { burst, oneStarRun, hiddenAuthorIndex } = REVIEW_STATES;
  const idOf = (slug: string) => products.find((p) => p.slug === slug)!.id;

  const freeForBurst = Array.from({ length: reviewers.length }, (_, i) => i).filter(
    (i) => i >= poolSize(burst.slug, reviewers.length) && i !== hiddenAuthorIndex,
  );
  if (burst.size <= RATING_BURST_THRESHOLD || freeForBurst.length < burst.size) {
    throw new Error(
      `seedReviews: the burst needs more than ${RATING_BURST_THRESHOLD} reviews on ${burst.slug} ` +
        `from pool accounts not yet on it — planned ${burst.size}, free ${freeForBurst.length}`,
    );
  }
  // One every minute over the last quarter-hour: the window is an hour wide.
  const burstRows = freeForBurst.slice(0, burst.size).map((index, k) => ({
    userId: reviewers[index].id,
    productId: idOf(burst.slug),
    rating: 5,
    ratingVisible: true,
    textStatus: ReviewTextStatus.APPROVED,
    createdAt: new Date(now - (k + 1) * MINUTE_MS),
  }));
  if (burstRows.some((r) => r.createdAt.getTime() <= now - RATING_BURST_WINDOW_HOURS * HOUR_MS)) {
    throw new Error('seedReviews: a burst review falls outside the dashboard window');
  }

  const runner = oneStarRun.reviewerIndex;
  const busy = oneStarRun.slugs.filter(
    (slug) => slug === burst.slug || runner < poolSize(slug, reviewers.length),
  );
  if (
    runner === hiddenAuthorIndex ||
    busy.length > 0 ||
    oneStarRun.slugs.length < ONE_STAR_RUN_THRESHOLD
  ) {
    throw new Error(
      `seedReviews: the 1★ run needs ${ONE_STAR_RUN_THRESHOLD}+ products the visible reviewer ` +
        `#${runner} has not reviewed and that are not bursting — clashes: ${busy.join(', ') || 'none'}`,
    );
  }
  // Two, three, four hours ago: well inside the 24-hour window.
  const oneStarRows = oneStarRun.slugs.map((slug, k) => ({
    userId: reviewers[runner].id,
    productId: idOf(slug),
    rating: 1,
    ratingVisible: true,
    textStatus: ReviewTextStatus.APPROVED,
    createdAt: new Date(now - (k + 2) * HOUR_MS),
    createdIp: oneStarRun.createdIp,
  }));
  if (oneStarRows.some((r) => r.createdAt.getTime() <= now - ONE_STAR_RUN_WINDOW_HOURS * HOUR_MS)) {
    throw new Error('seedReviews: a 1★ review falls outside the dashboard window');
  }

  return [...burstRows, ...oneStarRows];
}

/**
 * Rejections, the hidden author and the shop's replies — each through the
 * review domain's own repository method, on the rows just written. The ids are
 * new on every run (the pool is recreated), so they are looked up here.
 */
async function applyModeration(
  prisma: PrismaClient,
  staff: ReviewStaff,
  reviewers: { id: string }[],
  productIdBySlug: Map<string, string>,
) {
  const repository = new ReviewRepository(
    prisma as unknown as ConstructorParameters<typeof ReviewRepository>[0],
  );
  // The first pool review of a product is always reviewer #0's, and always a text.
  const firstReviewOf = async (slug: string) => {
    const review = await prisma.review.findUnique({
      where: {
        userId_productId: { userId: reviewers[0].id, productId: productIdBySlug.get(slug)! },
      },
      select: { id: true },
    });
    if (!review) throw new Error(`seedReviews: no pool review on ${slug} to moderate`);
    return review.id;
  };

  for (const target of REVIEW_STATES.rejected) {
    await repository.rejectText(await firstReviewOf(target.slug));
  }

  const hidden = await repository.hideAuthorReviews(
    reviewers[REVIEW_STATES.hiddenAuthorIndex].id,
    ReviewHiddenReason.MODERATOR,
  );
  if (hidden === 0) {
    throw new Error('seedReviews: the hidden author has no reviews — pick another pool index');
  }

  for (const reply of REVIEW_STATES.replies) {
    const author = reply.author === 'owner' ? staff.owner : staff.content;
    await repository.upsertReply(await firstReviewOf(reply.slug), author.id, reply.body);
  }

  return {
    rejected: REVIEW_STATES.rejected.length,
    replies: REVIEW_STATES.replies.length,
    hidden,
  };
}
