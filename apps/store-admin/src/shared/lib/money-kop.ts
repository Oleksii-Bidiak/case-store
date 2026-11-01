import { formatCurrency } from "./format/formatCurrency";

/**
 * Integer kopecks ↔ what an operator reads and types (R2, TASK-2047).
 *
 * The order money journal speaks whole kopecks on the wire. These helpers never
 * multiply or divide a float: hryvnias and kopecks are split with integer
 * `Math.trunc` / `%`, and typed input is parsed as a STRING — «1 234,50» is
 * «1234» and «50», never `1234.5 * 100` (which is 123449.99… on some values).
 */

/** "1234.05" for 123405 — the decimal string `formatCurrency` takes. */
function kopToDecimal(kop: number): string {
  const sign = kop < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(kop));
  const hryvnias = Math.trunc(abs / 100);
  const rest = abs % 100;
  return `${sign}${hryvnias}.${String(rest).padStart(2, "0")}`;
}

/** 123405 → «1 234,05 ₴» through the admin's one money formatter. */
export function formatKop(kop: number): string {
  return formatCurrency(kopToDecimal(kop));
}

/**
 * The value an amount field is prefilled with: «1234,5» style without
 * grouping, comma as the decimal mark, no trailing «,00». Empty for ≤ 0.
 */
export function kopToInput(kop: number): string {
  if (!Number.isInteger(kop) || kop <= 0) return "";
  const hryvnias = Math.trunc(kop / 100);
  const rest = kop % 100;
  if (rest === 0) return String(hryvnias);
  return `${hryvnias},${String(rest).padStart(2, "0")}`;
}

/** Above Postgres `int4` (the DTO's `@Max(2147483647)`) nothing is accepted. */
const MAX_KOP = 2_147_483_647;

/**
 * An amount as typed — «1 234,50», «1234.5», «499» — in whole kopecks, or
 * `null` when it is not an amount (letters, three decimals, negative, empty).
 * Spaces (incl. the NBSP a copied formatted sum carries) and a trailing «₴» or
 * «грн» are tolerated. Zero parses as 0: whether zero is allowed is the
 * caller's rule, not the parser's.
 */
export function parseKop(raw: string): number | null {
  const compact = raw.replace(/[\s  ]/g, "").replace(/(₴|грн\.?)$/i, "");
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(compact);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  // Leading zeros are harmless; a 16-digit hryvnia figure is not an amount.
  if (whole.replace(/^0+/, "").length > 8) return null;
  const kop =
    Number.parseInt(whole, 10) * 100 +
    Number.parseInt(fraction.padEnd(2, "0") || "0", 10);
  return kop > MAX_KOP ? null : kop;
}
