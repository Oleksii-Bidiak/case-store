/**
 * Pure logic for the catalog price filter: one shared model that keeps the
 * range slider and the min/max number inputs in sync (TASK-208).
 *
 * Conventions:
 *  - The filter domain is `[0, domainMax]` — `PRICE_DOMAIN_MAX` for the catalog,
 *    the highest saved price for the wishlist (TASK-1300). A bound sitting exactly on
 *    its domain edge means "no filter on this side": the input renders empty
 *    and the URL param is omitted.
 *  - Values are clamped (never rejected) on commit; an inverted pair is
 *    resolved by pulling the *edited* bound to the other one.
 */

/** Upper bound of the slider domain (₴). */
export const PRICE_DOMAIN_MAX = 100000;
/** Slider snap increment (the inputs accept any value, incl. decimals). */
export const PRICE_STEP = 100;

/** Clamp a price into the slider domain `[0, domainMax]`. */
export function clampPrice(
  value: number,
  domainMax: number = PRICE_DOMAIN_MAX,
): number {
  return Math.max(0, Math.min(domainMax, value));
}

/**
 * Parse raw input text into a price. Empty / non-numeric / non-finite input
 * yields `undefined` ("bound unset"); negatives are kept as-is so that
 * `normalizePriceRange` clamps them like any other out-of-domain value.
 */
export function parsePriceInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Resolve a (possibly partial, out-of-domain or inverted) pair of bounds into
 * an ordered in-domain range. `changed` names the bound the user just edited:
 * on inversion that bound is clamped to the other one, so the untouched field
 * never moves under the user.
 */
export function normalizePriceRange(
  min: number | undefined,
  max: number | undefined,
  changed: "min" | "max",
  domainMax: number = PRICE_DOMAIN_MAX,
): [number, number] {
  let lo = clampPrice(min ?? 0, domainMax);
  let hi = clampPrice(max ?? domainMax, domainMax);
  if (lo > hi) {
    if (changed === "min") lo = hi;
    else hi = lo;
  }
  return [lo, hi];
}

/**
 * Map a normalized range to the URL updates consumed by `onFilterChange`.
 * Domain-edge bounds are omitted (`undefined` deletes the param).
 */
export function priceRangeToUrlUpdates(
  [min, max]: [number, number],
  domainMax: number = PRICE_DOMAIN_MAX,
): {
  minPrice: string | undefined;
  maxPrice: string | undefined;
} {
  return {
    minPrice: min > 0 ? String(min) : undefined,
    maxPrice: max < domainMax ? String(max) : undefined,
  };
}

/**
 * Text shown in a bound's input: empty at its domain `edge` (filter unset),
 * the plain number otherwise.
 */
export function priceToInputText(value: number, edge: number): string {
  return value === edge ? "" : String(value);
}

/**
 * Stable identity of a range — used as the `lastPushedRef` token that tells
 * this component's own URL echo apart from a genuine external change
 * (docs/conventions/forms.md Rule 1b).
 */
export function rangeKey([min, max]: [number, number]): string {
  return `${min}:${max}`;
}
