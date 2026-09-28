import { Prisma } from '@prisma/client';
import { ReportRange } from './report-period';

/**
 * What counts as a sale — the one definition every report and the dashboard
 * share (plan 188, owner decision B-8).
 *
 * An order is a sale when its payment is PAID, PARTIALLY_REFUNDED or REFUNDED:
 * the money WAS taken on the day of the order, and whatever went back later is
 * a refund of its own day. Dropping the refunded statuses would let a refund in
 * September silently rewrite August; keeping only PAID (the dashboard before
 * TASK-694) made an order with one line returned vanish from revenue whole.
 */
export const SALES_BASE_STATUSES = Prisma.sql`('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')`;

/**
 * Every order line of a sale placed in `range` (all time when `null`), as a
 * subquery with columns `(product_id, order_id, quantity, amount)` where
 * `amount = price × quantity` at the price paid.
 *
 * The catalogue reports (categories, brands, leaders — TASK-687/688) and the
 * dashboard's top products all read lines through this, so "sold in August"
 * means the same rows in every one of them. Line amounts are GROSS: they are
 * what the lines were sold for, before order-level discounts and shipping, and
 * before refunds — which is why their sum is not the sales report's net, and
 * the screen says so.
 *
 * Range bounds compare the UTC-stored column with UTC `Date` parameters, the
 * same as `sales.repository.ts` (no `::timestamptz` — see there).
 */
export function soldLinesSql(range: ReportRange | null): Prisma.Sql {
  const inRange =
    range === null
      ? Prisma.sql`TRUE`
      : Prisma.sql`o.created_at >= ${range.start} AND o.created_at < ${range.end}`;

  return Prisma.sql`
    SELECT oi.product_id, oi.order_id, oi.quantity, oi.price * oi.quantity AS amount
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.payment_status IN ${SALES_BASE_STATUSES}
      AND ${inRange}
  `;
}
