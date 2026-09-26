import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { kyivDaySql } from '../../common/time/kyiv-day';
import { PrismaService } from '../../prisma';
import { ReportRange } from './report-period';
import { SALES_BASE_STATUSES } from './sales-base';

/** Money and count of one range, before net and average are derived. */
export interface SalesTotals {
  /** Σ `orders.total` of the sales base created in the range. */
  sales: number;
  /** Money that went back in the range — returns plus the full-refund residual. */
  refunds: number;
  /** Orders of the sales base created in the range. */
  orders: number;
}

/** One Kyiv day of the sales series. */
export interface SalesDay {
  date: string;
  sales: number;
  refunds: number;
  net: number;
}

/**
 * The payment statuses that make an order a sale (owner decision B-8) — the
 * one definition in `sales-base.ts`, shared with the catalogue reports and the
 * dashboard (TASK-687/688/694), so no two screens disagree on what was sold.
 */
const SALES_BASE = SALES_BASE_STATUSES;

/**
 * The sales report's money, in raw SQL (TASK-686, plan 188).
 *
 * ── The formula (owner decisions B-8 and 2026-09-26) ────────────────────────
 * - **Sales** of a range: Σ `orders.total` and the count of orders in
 *   {@link SALES_BASE} whose `created_at` falls in it. A later refund never
 *   touches this number.
 * - **Refunds** of a range: every refund EVENT dated in it (see
 *   {@link refundEvents}) — a return marked REFUNDED, dated by `resolved_at`,
 *   plus the full-refund residual of an order whose payment is now REFUNDED,
 *   dated by its move into REFUNDED.
 * - **Net** = sales − refunds; it is negative for a month with more refunds
 *   than sales, and that is the truth, not an error.
 *
 * A refund is an event of its own day, so a closed period never changes
 * retroactively.
 *
 * ── Why not `orders.deleted_at IS NULL` ─────────────────────────────────────
 * No code path sets `deleted_at` on an order today, and money that was taken
 * stays taken whatever an order's visibility: the report is deletedAt-agnostic
 * on purpose, exactly like the customer lifetime value
 * (`user-admin-card.entity.ts`). Were orders ever tombstoned, filtering here
 * would make last year's revenue shrink after a clean-up.
 *
 * ── Why the ranges are compared as they are ─────────────────────────────────
 * Every timestamp column is `TIMESTAMP(3)` WITHOUT time zone holding UTC wall
 * time, and the driver adapter sends a `Date` as an untyped UTC wall-clock
 * literal, which Postgres types from the column it is compared with. So
 * `col >= ${start}` compares UTC with UTC under any session `TimeZone`. A
 * `::timestamptz` cast on the parameter would read that literal in the session
 * zone instead — correct only while the server happens to run in UTC.
 * Days are bucketed with {@link kyivDaySql}, the SQL half of the same Kyiv day
 * the range's `start`/`end` were built from, so a WHERE and a GROUP BY can
 * never disagree about which day an order belongs to.
 *
 * Sums are `numeric` in SQL and cast `::float8` only at the edge (the
 * dashboard's pattern); `net` is subtracted in SQL too, so kopecks never meet
 * binary floating point before they are final.
 */
@Injectable()
export class SalesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sales, refunds and order count of `range`, or of all time when `range` is
   * `null`.
   *
   * `null` exists for the dashboard (TASK-694), whose "total revenue" tile must
   * be the same formula over no date bound — not a second, simpler query that
   * would give a second answer to "how much have I earned".
   */
  async getTotals(range: ReportRange | null): Promise<SalesTotals> {
    const rows = await this.prisma.$queryRaw<SalesTotals[]>`
      WITH sales AS (
        SELECT COALESCE(SUM(e.amount), 0) AS amount, COUNT(*)::int AS orders
        FROM (${saleEvents()}) e
        WHERE ${inRange(range)}
      ),
      refunds AS (
        SELECT COALESCE(SUM(e.amount), 0) AS amount
        FROM (${refundEvents()}) e
        WHERE ${inRange(range)}
      )
      SELECT sales.amount::float8 AS sales,
             refunds.amount::float8 AS refunds,
             sales.orders AS orders
      FROM sales, refunds
    `;
    return rows[0];
  }

  /**
   * One point per Kyiv day of `range`, first to last, days without activity
   * included as zeros — a chart must never close a gap by joining its
   * neighbours, and an empty period must still be a row per day, never `[]`.
   *
   * The series is generated from the calendar days themselves as `timestamp`
   * (no zone), so adding a day is pure calendar arithmetic: a DST switch in the
   * session zone can neither skip nor repeat a day.
   */
  async getDaily(range: ReportRange): Promise<SalesDay[]> {
    const eventDay = kyivDaySql(Prisma.raw('e.at'));

    return this.prisma.$queryRaw<SalesDay[]>`
      WITH days AS (
        SELECT d::date AS day
        FROM generate_series(
          ${range.fromDay}::date::timestamp,
          ${range.toDay}::date::timestamp,
          INTERVAL '1 day'
        ) AS d
      ),
      sales AS (
        SELECT ${eventDay} AS day, SUM(e.amount) AS amount
        FROM (${saleEvents()}) e
        WHERE ${inRange(range)}
        GROUP BY 1
      ),
      refunds AS (
        SELECT ${eventDay} AS day, SUM(e.amount) AS amount
        FROM (${refundEvents()}) e
        WHERE ${inRange(range)}
        GROUP BY 1
      )
      SELECT TO_CHAR(days.day, 'YYYY-MM-DD') AS date,
             COALESCE(s.amount, 0)::float8 AS sales,
             COALESCE(r.amount, 0)::float8 AS refunds,
             (COALESCE(s.amount, 0) - COALESCE(r.amount, 0))::float8 AS net
      FROM days
      LEFT JOIN sales s ON s.day = days.day
      LEFT JOIN refunds r ON r.day = days.day
      ORDER BY days.day
    `;
  }
}

/**
 * `e.at ∈ [start, end)` over an events subquery aliased `e`, or `TRUE` for an
 * all-time question. Sales and refunds expose the same `(at, amount)` shape, so
 * one predicate bounds them both — the two halves of a net can never be cut by
 * two different rules.
 */
function inRange(range: ReportRange | null): Prisma.Sql {
  if (range === null) return Prisma.sql`TRUE`;
  return Prisma.sql`e.at >= ${range.start} AND e.at < ${range.end}`;
}

/**
 * Every sale, one row per order: `(at, amount)` — an order of the sales base,
 * dated by its creation. A plain projection, so the planner pushes the range
 * predicate straight down onto `orders.created_at`.
 */
function saleEvents(): Prisma.Sql {
  return Prisma.sql`
    SELECT o.created_at AS at, o.total AS amount
    FROM orders o
    WHERE o.payment_status IN ${SALES_BASE}
  `;
}

/**
 * Every refund the shop made, one row per event: `(at, amount)`.
 *
 * (a) **Returns.** A return in REFUNDED with an amount and a resolution date is
 *     money sent back on `resolved_at`. A return in any other status is goods in
 *     transit, not money; one without an amount or a date cannot be put on a day
 *     and is left out rather than guessed.
 *
 * (b) **The full-refund residual.** Three paths move an order's payment to
 *     REFUNDED without creating a Return: a cancellation after payment, LiqPay's
 *     REFUNDED callback, and an operator's manual payment-status change. Counting
 *     returns alone would leave that money in the net forever. So an order whose
 *     CURRENT payment is REFUNDED contributes what its REFUNDED returns did not
 *     already cover — `total − Σ returns`, floored at 0 — which is 0 for a full
 *     refund done through Returns (no double count) and the whole total for a
 *     cancellation after payment.
 *
 *     It is dated by the order's LATEST history row that MOVED the payment into
 *     REFUNDED (a mark that was corrected back to PAID and set again counts from
 *     the second time; a mark corrected away for good fails the "current
 *     payment is REFUNDED" test and contributes nothing). Two kinds of row are
 *     not such a move and are skipped:
 *     - a row with a `note` — an event the shop recorded but did not act on;
 *     - a `REFUNDED → REFUNDED` row — `applyPaymentOutcome` records a provider
 *       event it REFUSED as `current → current` with no note (e.g. a late
 *       "success" on an order already refunded). Taken as the latest move, it
 *       would re-date an old refund to the day the stray callback arrived.
 *     An order with no qualifying row (history older than TASK-251, or a row
 *     written by hand) has no day to be put on and contributes nothing.
 */
function refundEvents(): Prisma.Sql {
  return Prisma.sql`
    SELECT r.resolved_at AS at, r.refunded_amount AS amount
    FROM returns r
    WHERE r.status = 'REFUNDED'
      AND r.refunded_amount IS NOT NULL
      AND r.resolved_at IS NOT NULL
    UNION ALL
    SELECT moved.at, GREATEST(o.total - COALESCE(returned.amount, 0), 0) AS amount
    FROM orders o
    JOIN LATERAL (
      SELECT MAX(h.changed_at) AS at
      FROM order_status_history h
      WHERE h.order_id = o.id
        AND h.change_type = 'PAYMENT_STATUS'
        AND h.to_payment_status = 'REFUNDED'
        AND h.from_payment_status IS DISTINCT FROM 'REFUNDED'
        AND h.note IS NULL
    ) moved ON moved.at IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT SUM(r.refunded_amount) AS amount
      FROM returns r
      WHERE r.order_id = o.id AND r.status = 'REFUNDED'
    ) returned ON TRUE
    WHERE o.payment_status = 'REFUNDED'
  `;
}
