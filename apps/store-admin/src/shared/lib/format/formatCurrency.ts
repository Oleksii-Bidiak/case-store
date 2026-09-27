// Canonical money formatter for the admin panel — the ONE function that turns an
// amount into hryvnia on screen (TASK-801).
//
// All amounts are stored as Decimal(10, 2) major-unit values (e.g. "29.99" or
// 1299). Output examples (uk-UA grouping, non-breaking spaces): "1 299 ₴",
// "29,99 ₴". Byte-for-byte the storefront's `formatMoney`, and the confirmation
// e-mail's `formatMoney` in store-api formats the same way — a customer on the
// phone and an operator on this screen read the same string.
//
// The "₴" sign is appended manually instead of `style: "currency"`: the symbol
// Intl picks for uk-UA/UAH differs across ICU versions ("грн" on the SSR Node
// runtime vs "₴" in browsers). The storefront banned it after a hydration
// mismatch; the admin renders money on the server too (the dashboard), so the
// same trip-wire was armed here.
const formatter = new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Format a decimal value ("29.99" or 1299) as a UAH currency string ("29,99 ₴").
 * Returns the input unchanged (stringified) when it is not a finite number.
 */
export function formatCurrency(value: string | number): string {
  const amount = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(amount)
    ? `${formatter.format(amount)} ₴`
    : String(value);
}
