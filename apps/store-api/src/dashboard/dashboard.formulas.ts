/**
 * Pure dashboard metric formulas (TASK-249).
 *
 * These are deliberately I/O-free — no Prisma, no `Date`, no config — so they
 * can be unit-tested in isolation (plain Jest, no DB, no mocks). The repository
 * feeds them already-aggregated numbers; all this module owns is the arithmetic
 * and the zero-denominator guards. Keeping the math here (rather than inline in
 * `DashboardRepository`) is what makes the "unit-tested formulas" acceptance
 * criterion a genuine Red→Green→Refactor target.
 */

/**
 * Average order value: earned revenue divided by the number of PAID orders.
 *
 * Returns `0` when there are no paid orders (guards divide-by-zero → no
 * `NaN`/`Infinity`), matching the `?? 0` empty-aggregate convention already used
 * throughout the dashboard repository.
 */
export function computeAverageOrderValue(revenue: number, paidOrderCount: number): number {
  return paidOrderCount === 0 ? 0 : revenue / paidOrderCount;
}

/** A single customer's order count, as returned by a `groupBy(userId)` aggregate. */
export interface UserOrderCount {
  userId: string;
  count: number;
}

/**
 * Repeat-buyer rate: the share (0..1) of customers who placed 2 or more orders.
 *
 * A "repeat buyer" is a customer with `count >= 2`; single-order buyers are
 * excluded from the numerator but still counted in the denominator (they are
 * part of the customer base). Returns `0` for an empty set (brand-new store)
 * rather than `NaN`. Windowing (e.g. last-90-days) is the caller's job — this
 * function only sees whatever counts it is handed.
 */
export function computeRepeatBuyerRate(userOrderCounts: UserOrderCount[]): number {
  if (userOrderCounts.length === 0) return 0;
  const repeatBuyers = userOrderCounts.filter((user) => user.count >= 2).length;
  return repeatBuyers / userOrderCounts.length;
}
