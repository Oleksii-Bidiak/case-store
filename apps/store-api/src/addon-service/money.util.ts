/**
 * Money helpers — the ONE implementation of cents ↔ decimal-string conversion
 * (TASK-174, made canonical by TASK-807).
 *
 * Everything money-shaped in this codebase crosses the wire as a decimal STRING,
 * never a float, and is summed in integer cents. Copies of these helpers in the
 * discount and order modules had already drifted (one clamped negatives to 0,
 * one rendered -50 cents as "-1.-50"); every module now imports from here, and a
 * caller that needs a floor at 0 writes `Math.max(0, …)` where it needs it.
 */

/**
 * Pad a Decimal-ish value to a two-decimal string ("499" → "499.00").
 *
 * Prisma's `Decimal.toString()` drops trailing zeros, and shipping an unpadded
 * price has bitten this codebase before (TASK-281, merchant feed) — so the
 * padding happens once, here, rather than at each call site.
 */
export function toTwoDecimals(value: { toString(): string }): string {
  return centsToString(toCents(value));
}

/** Parse a Decimal-ish value into integer cents (rounded, never floored). */
export function toCents(value: { toString(): string }): number {
  return Math.round(parseFloat(value.toString()) * 100);
}

/** Render integer cents back as a two-decimal string (-50 → "-0.50"). */
export function centsToString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, '0')}`;
}

/**
 * A line's total in cents: the unit price is rounded to cents FIRST, then
 * multiplied by the quantity — the order the cart, the discount preview and the
 * order all follow, so the same basket gives the same number everywhere.
 */
export function lineTotalCents(price: { toString(): string }, quantity: number): number {
  return toCents(price) * quantity;
}

/** Sum of {@link lineTotalCents} over a set of lines. */
export function sumLineCents(
  lines: ReadonlyArray<{ price: { toString(): string }; quantity: number }>,
): number {
  return lines.reduce((cents, line) => cents + lineTotalCents(line.price, line.quantity), 0);
}
