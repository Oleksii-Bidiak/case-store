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

/**
 * "A moderator has not withdrawn this account's contribution" — the second shared
 * predicate, now asked by three queries for one reason (TASK-586).
 *
 * `hiddenAt` is the abuse lever from the 2026-09-10 decision: one click removes
 * an account's WHOLE contribution, every rating and every text. Three read paths
 * have to honour that, and they reach it from different directions, which is
 * precisely why the arm is easy to leave out of one of them:
 *  - `findApprovedByProduct` — nobody may read a hidden author's text;
 *  - `findOwnByProduct` — the storefront must not offer an "add your text" form
 *    on a row the PATCH will refuse;
 *  - `findOwnById` — a hidden author keeps no write access to their own rows.
 *
 * The three consequences differ; the QUESTION is one, so it is written once. Miss
 * it in the first and hidden text is published; miss it in the third and a
 * moderated abuser goes on editing into the queue. Neither failure shows up on
 * screen as anything but normal operation.
 *
 * Note the asymmetry with {@link COUNTS_TOWARD_RATING} above, which has no
 * `hiddenAt` arm and must not grow one: that predicate runs against
 * `ratingVisible`, the denormalised *effective* flag which already folds this in.
 * Here there is no such flag — `textStatus` says what a MODERATOR thought of one
 * sentence, not whether its author still has standing.
 */
export const AUTHOR_NOT_HIDDEN = {
  hiddenAt: null,
} as const satisfies Prisma.ReviewWhereInput;
