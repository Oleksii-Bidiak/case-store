// Canonical money formatter for the admin panel.
//
// All amounts are stored as Decimal(10, 2) major-unit values (e.g. "29.99" or
// 1299). This is the single source of truth for rendering them as Ukrainian
// hryvnia. Output examples (uk-UA convention, non-breaking spaces): "1 299 ₴",
// "29,99 ₴". Mirrors the storefront's `formatMoney` (TASK-069).
const formatter = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Format a decimal value ("29.99" or 1299) as a UAH currency string ("29,99 ₴").
 * Returns the input unchanged (stringified) when it is not a finite number.
 */
export function formatCurrency(value: string | number): string {
  const amount = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(amount) ? formatter.format(amount) : String(value);
}
