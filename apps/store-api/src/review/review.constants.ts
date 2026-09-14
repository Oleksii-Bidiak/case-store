import { Prisma } from '@prisma/client';

/**
 * "This rating counts toward the product's score" — the single predicate, shared
 * by the two places that aggregate ratings (TASK-585).
 *
 * It exists as one exported object rather than two identical `where` clauses
 * because those two places are one click apart on screen: `ReviewRepository.
 * aggregate` draws the stars above the PDP's reviews tab, and `ProductRepository.
 * getRatingsByProductId` draws the stars on every catalogue card leading to it.
 * Spelled out twice, a filter added to one and forgotten in the other shows the
 * same product two different scores — and neither code path looks wrong when you
 * read it. Import this; do not re-spell it.
 *
 * `ratingVisible` is the only arm, and deliberately so:
 *  - the TEXT's status is irrelevant — a rating counts the moment it is given
 *    (the owner's decision of 2026-09-10), whatever became of the comment beside
 *    it;
 *  - hidden accounts need no arm either, because `ratingVisible` is the
 *    denormalised *effective* flag and already folds in both the email gate and a
 *    moderator's account-wide `hiddenAt`. That denormalisation is the whole point:
 *    this predicate runs for every card of every catalogue page, where a join to
 *    `users` would be unaffordable.
 */
export const COUNTS_TOWARD_RATING = {
  ratingVisible: true,
} as const satisfies Prisma.ReviewWhereInput;
