/**
 * Money helpers shared by the add-on-service module (TASK-174).
 *
 * Everything money-shaped in this codebase crosses the wire as a decimal STRING,
 * never a float, and is summed in integer cents. These two helpers are the only
 * places the add-on feature converts between the two representations.
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

/** Render integer cents back as a two-decimal string. */
export function centsToString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, '0')}`;
}
