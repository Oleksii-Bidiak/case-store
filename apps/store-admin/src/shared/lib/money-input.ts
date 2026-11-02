/** The API's money ceiling for an operator-typed amount (`@Max(100000)`). */
export const MONEY_INPUT_MAX = 100_000;

const MONEY_RE = /^\d+(?:[.,]\d{1,2})?$/;

/**
 * An amount an operator typed — «150», «150,5», «99.99» — as a number, or
 * `null` when it is empty or not a sum the API would take (negative, more than
 * two decimals, above {@link MONEY_INPUT_MAX}). A comma is a decimal point.
 *
 * Shared by the phone order and the delivery edit of an existing order
 * (TASK-1019 / AD-ORD-86), so the two cannot accept different sums.
 */
export function parseMoneyInput(raw: string): number | null {
  const value = raw.trim();
  if (!MONEY_RE.test(value)) return null;
  const amount = Number(value.replace(",", "."));
  return amount <= MONEY_INPUT_MAX ? amount : null;
}
