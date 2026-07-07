// Canonical percentage formatter for the admin panel.
//
// Input is a 0..1 fraction (e.g. 0.24 → "24%"), matching how the dashboard API
// returns rates (repeat-buyer rate is a plain 0..1 number; presentation lives
// on the frontend). Mirrors `formatCurrency.ts`'s uk-UA Intl approach.
const formatter = new Intl.NumberFormat("uk-UA", {
  style: "percent",
  maximumFractionDigits: 1,
});

/**
 * Format a 0..1 fraction as a Ukrainian percentage string ("0.24" or 0.24 →
 * "24%"). Returns the input unchanged (stringified) when it is not a finite
 * number, mirroring `formatCurrency`'s defensive fallback.
 */
export function formatPercent(value: string | number): string {
  const fraction = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(fraction) ? formatter.format(fraction) : String(value);
}
