import { hashStr } from './ids';
import type { OrderSpec } from '../types';

/**
 * One approved review that MUST carry the «Підтверджена покупка» badge: written
 * by the account that actually placed the order, about a position that order
 * actually contained.
 */
export interface VerifiedReviewSpec {
  /** Email of the buyer — resolved to a user id by the seeder. */
  email: string;
  /** SKU of the purchased position — resolved to a product id by the seeder. */
  sku: string;
  rating: number;
  comment: string;
}

/**
 * Post-delivery comments. Deliberately mundane and specific: a review that could
 * have been written about anything reads like filler, and the badge next to it
 * is what the demo is meant to show off.
 */
const COMMENTS = [
  'Замовляв тут, прийшло за два дні. Все як в описі, претензій немає.',
  'Користуюся другий тиждень після доставки — працює бездоганно.',
  'Отримав у відділенні, упаковка ціла, комплектація повна. Дякую.',
  'Брав саме в цьому магазині — товар оригінальний, чек і гарантія на місці.',
  'Доставили швидше, ніж обіцяли. Якість відповідає ціні, рекомендую.',
  'Замовлення прийшло без пошкоджень, усе перевірив при отриманні. Все добре.',
];

/**
 * Which seeded orders count as a purchase worth reviewing.
 *
 * DELIVERED only. The badge query itself is broader — `ReviewRepository`
 * matches ANY order of the user's containing the product, whatever its status —
 * but demo data should not show a shopper praising something they have not
 * received, or something they sent back (`mariia-2` passed through DELIVERED on
 * its way to REFUNDED and is excluded on purpose).
 */
function isDelivered(spec: OrderSpec): boolean {
  return spec.status === 'DELIVERED';
}

/**
 * Derive the reviews that make the «Підтверджена покупка» badge visible, from
 * the SAME order specs the order seeder writes (TASK-409).
 *
 * ## The bug this exists to fix
 *
 * The badge is not a column. It is resolved per review by asking whether the
 * REVIEW'S AUTHOR has an order line for that product (`review.repository.ts`).
 * The seed wrote every approved review from a dedicated `reviewerN@store.com`
 * account and every order from a `customers` account, so that join could never
 * match — not for one product, not for one review. The badge was unreachable in
 * the demo, and no amount of clicking around could have found it.
 *
 * Deriving the pairs from `orderSpecs` rather than listing them by hand is the
 * point: when an order's SKU changes, its review follows, so the two data files
 * cannot drift into a silently badge-less seed again.
 *
 * Deduplicated on `(email, sku)` — `Review` is unique on `(userId, productId)`,
 * and a buyer who ordered the same position twice still writes one review.
 */
export function buildVerifiedPurchaseReviews(specs: OrderSpec[]): VerifiedReviewSpec[] {
  const seen = new Set<string>();
  const reviews: VerifiedReviewSpec[] = [];

  for (const spec of specs.filter(isDelivered)) {
    for (const item of spec.items) {
      const pair = `${spec.email}:${item.sku}`;
      if (seen.has(pair)) continue;
      seen.add(pair);

      const hash = hashStr(pair);
      reviews.push({
        email: spec.email,
        sku: item.sku,
        // 4 or 5 — a delivered, un-refunded order that the buyer bothered to
        // review. Stable per pair, so re-seeding never shuffles the ratings.
        rating: hash % 4 === 0 ? 4 : 5,
        comment: COMMENTS[hash % COMMENTS.length],
      });
    }
  }

  return reviews;
}
