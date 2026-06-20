// Canonical money formatter for the storefront.
//
// All prices are stored as Decimal(10, 2) major-unit strings (e.g. "29.99").
// This is the single source of truth for rendering them as Ukrainian hryvnia.
// Output examples (uk-UA convention, non-breaking spaces): "1 299 ₴", "29,99 ₴".
const formatter = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Format a decimal string price ("29.99") as a UAH currency string ("29,99 ₴").
 * Returns the input unchanged when it is not a finite number.
 */
export function formatMoney(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? formatter.format(amount) : value;
}
