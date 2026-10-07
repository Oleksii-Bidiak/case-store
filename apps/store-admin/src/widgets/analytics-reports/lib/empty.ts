import type {
  ComparedValueEntity,
  SalesReportEntity,
} from "@/entities/analytics";

/**
 * When a report has nothing to show (ДН-8.7) — one rule for the card and its
 * CSV, so the file never carries rows the screen replaced with a sentence.
 */

/**
 * A period with no paid order and no refund. The tiles still show their
 * zeros (they are real), but the per-day chart gives way to a statement.
 */
export function isEmptySales(data: SalesReportEntity): boolean {
  return (
    data.sales.current === 0 &&
    data.refunds.current === 0 &&
    data.orders.current === 0
  );
}

/**
 * Nothing sold among these rows. The categories report lists every root
 * category, sold or not, so an empty period arrives as a column of zeros —
 * not as an empty list — and is told as «За період нічого не продано».
 */
export function soldNothing(
  rows: readonly { units: ComparedValueEntity }[],
): boolean {
  return rows.every((row) => row.units.current === 0);
}
