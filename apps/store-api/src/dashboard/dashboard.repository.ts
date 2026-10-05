import { Injectable } from '@nestjs/common';
import {
  NotificationOutboxStatus,
  OrderHistoryNote,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ReviewTextStatus,
} from '@prisma/client';
import { roundMoney } from '../analytics/reports/entities/report-common.entity';
import { ProductsReportRepository } from '../analytics/reports/products-report.repository';
import { lastKyivDays, type ReportRange } from '../analytics/reports/report-period';
import { SalesRepository } from '../analytics/reports/sales.repository';
import { kyivDaySql } from '../common/time/kyiv-day';
import { PrismaService } from '../prisma';
import { moderationQueueWhere } from '../review/review.constants';
import {
  DASHBOARD_WINDOW_DAYS,
  LOW_STOCK_LIMIT,
  LOW_STOCK_THRESHOLD,
  ONE_STAR_RUN_THRESHOLD,
  ONE_STAR_RUN_WINDOW_HOURS,
  PENDING_STALE_HOURS,
  RATING_BURST_THRESHOLD,
  RATING_BURST_WINDOW_HOURS,
  REPEAT_BUYER_WINDOW_DAYS,
  TOP_PRODUCTS_LIMIT,
  type DailyDataPoint,
  type DashboardSummaryBase,
  type LowStockProduct,
  type NeedsAction,
  type RatingAbuseSignals,
  type OrderStatusCount,
  type RevenueMetrics,
  type TopProduct,
  type TopProductsRanking,
} from './dashboard.types';
import { computeAverageOrderValue, computeRepeatBuyerRate } from './dashboard.formulas';

/**
 * Revenue is counted by PAYMENT status, never by order status: since TASK-151
 * decoupled the two, an order can sit at CONFIRMED/PROCESSING while still unpaid
 * (e.g. cash-on-delivery awaiting collection), so the dashboard reflects earned
 * revenue, not merely accepted orders (TASK-152). Since TASK-694 "earned" is the
 * `/analytics` formula, read through `SalesRepository`: sales of PAID /
 * PARTIALLY_REFUNDED / REFUNDED orders by creation day, minus refunds by the day
 * the money went back — see {@link DashboardRepository.getRevenueMetrics}. The
 * top products read the reports' leaders query (TASK-688) over the same base.
 *
 * Alongside earned revenue, TASK-137 adds an "unrealized" revenue pair
 * (`getUnrealizedRevenue` / `getUnrealizedRevenueSince`): the value of orders that
 * are still active but not yet paid (`paymentStatus != PAID` AND `status NOT IN
 * (CANCELLED, REFUNDED)`). This is the receivable pipeline — money expected but
 * not yet collected (e.g. COD awaiting collection, or a failed payment pending a
 * retry) — shown beside earned revenue so the admin can read both at a glance.
 *
 * TASK-249 (dashboard metrics v2, `docs/plans/120-dashboard-metrics-v2.md`)
 * absorbs this in-transit/unrealized revenue metric as-is with no further
 * changes — see that plan for why it deliberately keeps a single all-active-unpaid
 * figure rather than splitting off a narrower "shipped-but-unpaid" number. What
 * TASK-249 adds instead is average order value and repeat-buyer rate (see
 * `dashboard.formulas.ts` + `getRevenueMetrics` / `getRepeatBuyerRate` below).
 */

/** Raw-query row shape for the gap-filled daily series. */
interface DailyRow {
  date: string;
  value: number;
}

/**
 * Read-only repository assembling all admin-dashboard metrics from existing
 * tables. No writes, no migrations — every method is an aggregate query.
 *
 * Time-series methods use raw SQL with PostgreSQL `generate_series` over the
 * window's KYIV days (TASK-694) so the returned series always spans the full
 * window (missing days come back as 0 rather than gaps), bucketed by the same
 * Kyiv day as `/analytics`. The project is PostgreSQL-only across
 * all environments (Docker Compose dev + `store_test` e2e DB), so these raw
 * queries are safe — there is no SQLite fallback to consider.
 */
@Injectable()
export class DashboardRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsReportRepository: ProductsReportRepository,
    private readonly salesRepository: SalesRepository,
  ) {}

  /**
   * Run every NON-money metric query in parallel and assemble the summary
   * payload (TASK-684).
   *
   * The `revenue` block is not here: {@link getRevenueMetrics} computes it, and
   * the service calls that only for a caller holding `analytics:revenue`. A query
   * that never runs cannot leak through a later refactor that forgets to drop
   * its result. Top products still carry `totalRevenue` — the service strips it —
   * but they are SELECTED and ordered by `topProductsRankedBy`, which defaults to
   * units: the safe answer for a caller that forgets to ask, because a list
   * ranked by money tells its reader which product earns most even with every
   * sum removed.
   */
  async getSummary(
    options: { windowDays?: number; topProductsRankedBy?: TopProductsRanking } = {},
  ): Promise<DashboardSummaryBase> {
    const window = this.window(options.windowDays ?? DASHBOARD_WINDOW_DAYS);

    const [
      totalOrders,
      ordersByStatus,
      ordersByDay,
      totalUsers,
      newUsersByDay,
      repeatBuyerRate,
      repeatBuyerRateLast90Days,
      totalProducts,
      activeProducts,
      topProducts,
      lowStockProducts,
      averageProcessingHoursLast30Days,
    ] = await Promise.all([
      this.prisma.order.count(),
      this.getOrderCountByStatus(),
      this.getOrdersByDay(window),
      this.prisma.user.count(),
      this.getNewUsersByDay(window),
      this.getRepeatBuyerRate(),
      this.getRepeatBuyerRate(this.window(REPEAT_BUYER_WINDOW_DAYS).start),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { isActive: true } }),
      this.getTopProducts(TOP_PRODUCTS_LIMIT, options.topProductsRankedBy ?? 'units'),
      this.getLowStockProducts(LOW_STOCK_THRESHOLD, LOW_STOCK_LIMIT),
      this.getAverageProcessingHours(window.start),
    ]);

    return {
      orders: { totalOrders, ordersByStatus, ordersByDay },
      users: { totalUsers, newUsersByDay },
      customers: { repeatBuyerRate, repeatBuyerRateLast90Days },
      products: { totalProducts, activeProducts, topProducts },
      inventory: { lowStockProducts },
      operations: { averageProcessingHoursLast30Days },
    };
  }

  /**
   * The dashboard's money (TASK-684): earned and unrealized revenue, average
   * order value and the daily revenue series. Split out of {@link getSummary} so
   * it is computed only for a caller allowed to see it — see `DashboardService`.
   *
   * Earned revenue is the `/analytics` sales report's formula, read through the
   * same `SalesRepository` (TASK-694): **net** = sales (PAID / PARTIALLY_REFUNDED
   * / REFUNDED orders by creation) − refunds (by the day the money went back).
   * Before, the tile summed PAID orders only, so an order of 30 000 ₴ with 500 ₴
   * returned vanished from revenue whole, and a full refund of an old purchase
   * rewrote a month already seen. Two formulas on two screens are two answers to
   * "how much did I earn", and an operator cannot tell which one is right.
   *
   * - `totalRevenue` — net over all time;
   * - `revenueLast30Days` — net over the last 30 Kyiv days;
   * - `averageOrderValueLast30Days` — that net ÷ the sales-base orders of the
   *   window, as in the report;
   * - `revenueByDay` — the report's daily net, one point per Kyiv day.
   * Unrealized revenue is not revenue (money still owed) and keeps its own
   * formula; only its window moves to the Kyiv days.
   */
  async getRevenueMetrics(windowDays: number = DASHBOARD_WINDOW_DAYS): Promise<RevenueMetrics> {
    const window = this.window(windowDays);

    const [allTime, inWindow, daily, unrealizedRevenue, unrealizedRevenueLast30Days] =
      await Promise.all([
        this.salesRepository.getTotals(null),
        this.salesRepository.getTotals(window),
        this.salesRepository.getDaily(window),
        this.getUnrealizedRevenue(),
        this.getUnrealizedRevenueSince(window.start),
      ]);

    const revenueLast30Days = roundMoney(inWindow.sales - inWindow.refunds);
    return {
      totalRevenue: roundMoney(allTime.sales - allTime.refunds),
      revenueLast30Days,
      unrealizedRevenue,
      unrealizedRevenueLast30Days,
      averageOrderValueLast30Days: computeAverageOrderValue(revenueLast30Days, inWindow.orders),
      revenueByDay: daily.map(({ date, net }) => ({ date, value: net })),
    };
  }

  /**
   * The rolling window of the last `windowDays` KYIV days, today included —
   * the same range `/analytics` gives its «30 днів» preset (`lastKyivDays`).
   *
   * It replaces a start built from the server's local midnight beside a SQL
   * series anchored on `DATE_TRUNC('day', NOW())` in the session zone: the two
   * agreed only while both ran UTC, and even then the shop's day was not UTC's —
   * an order at 01:30 in Kyiv landed on the day before (TASK-694).
   */
  private window(windowDays: number): ReportRange {
    return lastKyivDays(windowDays, new Date());
  }

  /**
   * The "active but unpaid" order predicate — money we still expect to receive —
   * AND `status NOT IN (CANCELLED, REFUNDED)`. Single source of truth for the
   * receivable-pipeline filter, shared by `getUnrealizedRevenue`,
   * `getUnrealizedRevenueSince`, and the `unpaidInTransit` needs-action count
   * (TASK-248) so the three never drift apart. Private to this repository —
   * `OrderRepository.findAll()`'s own `unpaidInTransit` filter is written
   * independently (no cross-module `dashboard`→`order` dependency).
   *
   * `PARTIALLY_REFUNDED` is excluded alongside `PAID` and NOT written as
   * `!= PAID` (review of plan 180). That status is only reachable FROM `PAID`, so on such
   * an order the money did arrive in full and some of it went back — the shop is
   * owed nothing. Counting it as `!= PAID` added the order's ENTIRE total to
   * unrealized revenue and put it in the "unpaid in transit" queue, sending an
   * operator to chase a customer who paid.
   *
   * Note this is a different question from the «Борг» mark, which deliberately
   * casts a wider net (`∉ {PAID, REFUNDED}`, B-1 §1): the mark asks "is there an
   * open money question on this order", this predicate asks "how much have we
   * not been paid". A partially refunded order answers yes to the first and
   * zero to the second.
   */
  private unrealizedOrderWhere(): Prisma.OrderWhereInput {
    return {
      paymentStatus: { notIn: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
    };
  }

  /**
   * The "at least one line can no longer be supplied" order predicate
   * (TASK-470) — the aggregate behind the «Недоступні позиції» tile.
   *
   * Written here rather than imported from `OrderRepository`, for the same
   * reason {@link unrealizedOrderWhere} is: no cross-module `dashboard`→`order`
   * dependency. The two restate the owner's four conditions (B-1 §3) — deleted,
   * unpublished, oversold, or a reservation the TTL worker released — and the
   * list's `hasUnavailableItems` filter is the deep-link target of this tile, so
   * the number and the rows it opens have to agree condition for condition.
   *
   * The fourth (`restockedAt` on a live order) fires only with
   * ORDER_RESERVATION_EXPIRY=release (TASK-627): the worker then returns an
   * unpaid order's units and keeps the order open, and a late payment that finds
   * them sold leaves the mark set. In the default `cancel` mode `restockedAt`
   * only ever arrives together with CANCELLED, which is excluded below.
   *
   * CANCELLED and REFUNDED orders are excluded: their stock returned because the
   * order ENDED, and counting them would make the tile a permanent, growing
   * number nobody can ever clear.
   */
  private unavailableItemsOrderWhere(): Prisma.OrderWhereInput {
    return {
      deletedAt: null,
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
      OR: [
        {
          items: {
            some: {
              product: {
                OR: [{ deletedAt: { not: null } }, { isActive: false }, { stock: { lt: 0 } }],
              },
            },
          },
        },
        { restockedAt: { not: null } },
      ],
    };
  }

  /**
   * «Оплачено після скасування» (TASK-352 (c), decision B-11 №3): a late
   * provider success on an order the TTL worker had already cancelled. TASK-619
   * records the money (PAID) and leaves the order CANCELLED with the history
   * note PAID_AFTER_CANCEL; nothing else happens automatically — no refund, no
   * revive. This predicate is how the operator finds such orders.
   *
   * Clears itself when the operator acts: a revive moves the order out of
   * CANCELLED, a refund moves the payment out of PAID. Restated (not imported)
   * by the order list's `paidAfterCancel` filter, the tile's deep-link target —
   * the same reason as {@link unrealizedOrderWhere}.
   */
  private paidAfterCancelOrderWhere(): Prisma.OrderWhereInput {
    return {
      deletedAt: null,
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.PAID,
      statusHistory: { some: { note: OrderHistoryNote.PAID_AFTER_CANCEL } },
    };
  }

  /**
   * Unrealized (pending-payment) revenue: sum of `Order.total` for orders that
   * are still active but not yet paid — `paymentStatus != PAID` AND `status NOT
   * IN (CANCELLED, REFUNDED)`. This is the receivable pipeline, the complement to
   * earned revenue (TASK-137).
   */
  private async getUnrealizedRevenue(): Promise<number> {
    const result = await this.prisma.order.aggregate({
      _sum: { total: true },
      where: this.unrealizedOrderWhere(),
    });
    return Number(result._sum.total ?? 0);
  }

  /** Unrealized revenue since a given date (same active-but-unpaid filter). */
  private async getUnrealizedRevenueSince(since: Date): Promise<number> {
    const result = await this.prisma.order.aggregate({
      _sum: { total: true },
      where: { ...this.unrealizedOrderWhere(), createdAt: { gte: since } },
    });
    return Number(result._sum.total ?? 0);
  }

  /**
   * Repeat-buyer rate (TASK-249): the share (0..1) of customers who placed 2+
   * non-CANCELLED orders. Groups orders by `userId` and hands the per-user counts
   * to the pure {@link computeRepeatBuyerRate} formula.
   *
   * CANCELLED orders are excluded (an order the customer backed out of never
   * happened); REFUNDED orders are kept (a real completed transaction and
   * relationship) — deliberately narrower than {@link unrealizedOrderWhere}'s
   * two-status exclusion (plan 120 Design Decision 3). When `since` is provided,
   * both numerator and denominator are windowed to orders created on/after it.
   *
   * Guest orders (`userId IS NULL`, TASK-338) are excluded from BOTH numerator and
   * denominator, and the exclusion is load-bearing rather than cosmetic: `groupBy`
   * collapses every guest order in the shop into ONE row keyed `null`, which the
   * formula would then read as a single customer who bought N times — the metric
   * would climb towards 100% as guest checkout got more popular. There is no
   * honest alternative, because two guest orders cannot be told apart: repeat
   * buying is only observable where there is an account to observe it on.
   */
  private async getRepeatBuyerRate(since?: Date): Promise<number> {
    const grouped = await this.prisma.order.groupBy({
      by: ['userId'],
      where: {
        userId: { not: null },
        status: { not: OrderStatus.CANCELLED },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      _count: { id: true },
    });
    // flatMap, not map + cast: the `where` above already removed the nulls, but
    // Prisma's groupBy return type does not narrow from a filter, and a cast here
    // would silently hide a real null if that filter were ever dropped.
    return computeRepeatBuyerRate(
      grouped.flatMap((row) =>
        row.userId === null ? [] : [{ userId: row.userId, count: row._count.id }],
      ),
    );
  }

  /**
   * "Needs action" counters for the dashboard widget + sidebar badges
   * (TASK-248). Independent reads run in a single `Promise.all` — no N+1, no
   * joins, mirroring the `getSummary()` parallelization style:
   *   - `newOrders`       — orders awaiting confirmation (`status = PENDING`)
   *   - `pendingReviews`  — review TEXTS awaiting a verdict, counted with the exact
   *                         `where` of `ReviewRepository.findForModeration('pending')`.
   *                         Deliberately not about ratings: since TASK-585 a rating
   *                         needs no moderator, so counting invisible ratings here
   *                         would send an operator to a queue with nothing to do —
   *                         which is what `textStatus = PENDING` alone did until
   *                         TASK-598, because star-only rows are written PENDING too
   *   - `unpaidInTransit` — active-but-unpaid orders ({@link unrealizedOrderWhere})
   *   - `failedMails`     — outbox rows permanently failed (`status = FAILED`)
   *   - `ratingAbuse`     — bursts and one-star runs, each situation once
   *                         ({@link getRatingAbuseSignals}); `ratingAbuseSignals`
   *                         names them so the card can link to the series (TASK-601)
   *   - `unavailableItems`— open orders with a line that can no longer be supplied
   *                         ({@link unavailableItemsOrderWhere}, TASK-470). The one
   *                         counter here that nothing ELSE in the system reacts to:
   *                         the owner's decision (B-1 §3) is that the buyer is told
   *                         by a person, so this tile is the only notification there is
   *   - `paidAfterCancel` — late-paid orders still cancelled
   *                         ({@link paidAfterCancelOrderWhere}, TASK-352): money the
   *                         shop holds for an order it is not fulfilling
   */
  async getNeedsAction(): Promise<NeedsAction> {
    const [
      newOrders,
      pendingReviews,
      unpaidInTransit,
      failedMails,
      pendingOver48h,
      ratingAbuseSignals,
      unavailableItems,
      paidAfterCancel,
    ] = await Promise.all([
      this.prisma.order.count({ where: { status: OrderStatus.PENDING, deletedAt: null } }),
      this.prisma.review.count({ where: moderationQueueWhere(ReviewTextStatus.PENDING) }),
      this.prisma.order.count({ where: this.unrealizedOrderWhere() }),
      this.prisma.notificationOutbox.count({ where: { status: NotificationOutboxStatus.FAILED } }),
      this.prisma.order.count({ where: this.pendingOver48hWhere() }),
      this.getRatingAbuseSignals(),
      this.prisma.order.count({ where: this.unavailableItemsOrderWhere() }),
      this.prisma.order.count({ where: this.paidAfterCancelOrderWhere() }),
    ]);
    return {
      newOrders,
      pendingReviews,
      unpaidInTransit,
      failedMails,
      pendingOver48h,
      ratingAbuse: ratingAbuseSignals.productIds.length + ratingAbuseSignals.createdIps.length,
      ratingAbuseSignals,
      unavailableItems,
      paidAfterCancel,
    };
  }

  /**
   * What currently looks like rating abuse (TASK-589) — the owner's decision 7:
   * «>10 оцінок на один товар за годину, або серія 1★ з однієї IP».
   *
   * Two `groupBy … having` queries naming FLAGGED THINGS — distinct products and
   * distinct addresses — not reviews; `ratingAbuse` is how many there are.
   * Named rather than only counted since TASK-601, so the dashboard card can
   * open the very series (`/reviews?status=all&productId=…` or `&createdIp=…`)
   * instead of a moderation queue the star-only rows are not even in. The widget's job
   * is to say how many situations are worth opening, and a review count would
   * read as an emergency the first time one product legitimately went viral.
   *
   * ## `createdIp: { not: null }` is load-bearing
   *
   * The column arrived with TASK-588, so it is null on every earlier row — the
   * whole seeded catalogue included. Prisma groups nulls like any other value, so
   * without this filter the second query returns one group of ~2 200 one-star-ish
   * rows and the panel opens on a single "address" responsible for the entire
   * shop. Absent means "we do not know", never "the same as the last one".
   *
   * ## `hiddenAt: null` is what makes it clearable (TASK-598)
   *
   * Hiding the author is the action this signal exists to prompt, and it leaves
   * the rows in place. Counting them anyway produced a "needs action" number that
   * the action did not change — still there an hour later, still there a day
   * later — and an operator who clicks through twice and finds nothing to do stops
   * clicking. A counter no action can clear is worse than no counter.
   */
  private async getRatingAbuseSignals(): Promise<RatingAbuseSignals> {
    const burstProducts = await this.prisma.review.groupBy({
      by: ['productId'],
      where: {
        hiddenAt: null,
        createdAt: { gte: this.hoursAgo(RATING_BURST_WINDOW_HOURS) },
      },
      having: { productId: { _count: { gt: RATING_BURST_THRESHOLD } } },
    });
    const productIds = burstProducts.map((row) => row.productId).sort();

    // ## One situation is counted once (TASK-601)
    //
    // A single abuser firing eleven 1★ at one product in an hour used to be TWO
    // flagged things — the product (a burst) and the address (a run) — so the
    // card read 2 where there was one person to deal with, and opening either
    // link led to the same rows. The address query therefore runs AFTER the
    // burst query and skips the rows already inside a flagged product: an
    // address is its own situation only if it reaches the run threshold
    // elsewhere. Sequential rather than `Promise.all` because the second query
    // depends on the first; both are index reads (TASK-600).
    const oneStarAddresses = await this.prisma.review.groupBy({
      by: ['createdIp'],
      where: {
        rating: 1,
        hiddenAt: null,
        createdIp: { not: null },
        createdAt: { gte: this.hoursAgo(ONE_STAR_RUN_WINDOW_HOURS) },
        ...(productIds.length > 0 ? { productId: { notIn: productIds } } : {}),
      },
      having: { createdIp: { _count: { gte: ONE_STAR_RUN_THRESHOLD } } },
    });
    // flatMap, not a cast: the `where` already excludes nulls, but groupBy's
    // return type does not narrow from a filter.
    const createdIps = oneStarAddresses
      .flatMap((row) => (row.createdIp === null ? [] : [row.createdIp]))
      .sort();

    return { productIds, createdIps };
  }

  /** The instant `hours` ago — the left edge of a rolling abuse window. */
  private hoursAgo(hours: number): Date {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  }

  /**
   * PENDING orders created more than {@link PENDING_STALE_HOURS} hours ago
   * (TASK-251). A deliberate subset of `newOrders` — the ones that have been
   * waiting too long. Mirrors {@link unrealizedOrderWhere}'s helper shape.
   */
  private pendingOver48hWhere(): Prisma.OrderWhereInput {
    return {
      status: OrderStatus.PENDING,
      deletedAt: null,
      createdAt: { lt: new Date(Date.now() - PENDING_STALE_HOURS * 60 * 60 * 1000) },
    };
  }

  /**
   * Average hours from order creation to the order's FIRST SHIPPED transition
   * (TASK-251), for orders created since `since` that have shipped at least
   * once. A LATERAL join takes `MIN(changed_at)` of the STATUS→SHIPPED history
   * rows per order (the first ship, so a later revive-and-reship never distorts
   * the metric); orders that never shipped are excluded from both numerator and
   * denominator. Returns 0 (not null/NaN) when none have shipped yet.
   *
   * Prisma's `groupBy` cannot express the per-order correlated subquery, so raw
   * SQL is used — pinned by a fixture-based int-spec against real Postgres.
   */
  private async getAverageProcessingHours(since: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ avgHours: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (h.first_shipped_at - o.created_at)) / 3600.0)::float8 AS "avgHours"
      FROM orders o
      JOIN LATERAL (
        SELECT MIN(changed_at) AS first_shipped_at
        FROM order_status_history
        WHERE order_id = o.id AND change_type = 'STATUS' AND to_status = 'SHIPPED'
      ) h ON true
      WHERE h.first_shipped_at IS NOT NULL
        AND o.created_at >= ${since}
    `;
    return Number(rows[0]?.avgHours ?? 0);
  }

  /** Order counts grouped by status. */
  private async getOrderCountByStatus(): Promise<OrderStatusCount[]> {
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      _count: { id: true },
    });
    return grouped.map((row) => ({ status: row.status, count: row._count.id }));
  }

  /** Daily order count over the window's Kyiv days, gap-filled (every order, as before). */
  private async getOrdersByDay(window: ReportRange): Promise<DailyDataPoint[]> {
    return this.countByKyivDay(window, Prisma.sql`orders`, Prisma.raw('created_at'));
  }

  /** Daily new-user registrations over the window's Kyiv days, gap-filled. */
  private async getNewUsersByDay(window: ReportRange): Promise<DailyDataPoint[]> {
    return this.countByKyivDay(window, Prisma.sql`users`, Prisma.raw('created_at'));
  }

  /**
   * Rows of `table` per Kyiv day of `window`, one point per day, zeros kept.
   *
   * The same day as every other series and the `/analytics` reports (TASK-694):
   * rows are filtered by the window's instants and bucketed by `kyivDaySql`, the
   * SQL half of the Kyiv day those instants were built from — the JS filter and
   * the SQL series can no longer disagree about which day a row belongs to. The
   * series is generated from calendar days as zone-less timestamps, so a DST
   * switch can neither skip nor repeat a day. `table` and `column` are trusted
   * identifiers from this file, never input.
   */
  private async countByKyivDay(
    window: ReportRange,
    table: Prisma.Sql,
    column: Prisma.Sql,
  ): Promise<DailyDataPoint[]> {
    const day = kyivDaySql(Prisma.sql`t.${column}`);
    const rows = await this.prisma.$queryRaw<DailyRow[]>`
      WITH days AS (
        SELECT d::date AS day
        FROM generate_series(
          ${window.fromDay}::date::timestamp,
          ${window.toDay}::date::timestamp,
          INTERVAL '1 day'
        ) AS d
      ),
      counted AS (
        SELECT ${day} AS day, COUNT(*) AS n
        FROM ${table} t
        WHERE t.${column} >= ${window.start} AND t.${column} < ${window.end}
        GROUP BY 1
      )
      SELECT TO_CHAR(days.day, 'YYYY-MM-DD') AS date,
             COALESCE(c.n, 0)::int AS value
      FROM days
      LEFT JOIN counted c ON c.day = days.day
      ORDER BY days.day
    `;
    return this.normalizeSeries(rows);
  }

  /**
   * Top products, all time — the SAME query as the `/analytics` leaders
   * (`ProductsReportRepository.getLeaders`, TASK-688), over no date bound.
   *
   * Revenue is `SUM(price * quantity)` over lines of the sales base (PAID,
   * PARTIALLY_REFUNDED, REFUNDED). Before TASK-688 this counted PAID lines only,
   * so an order with one line refunded took all its lines out of the ranking,
   * and "top 5" here disagreed with the report's leaders.
   *
   * `rankedBy` picks the list itself, not just its order (TASK-684): ranked by
   * units, a tie falls back to the product id, so nothing about money decides
   * a list shown to someone who may not see money.
   */
  private async getTopProducts(limit: number, rankedBy: TopProductsRanking): Promise<TopProduct[]> {
    const rows = await this.productsReportRepository.getLeaders(null, limit, rankedBy);
    return rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      totalRevenue: Number(row.revenue),
      unitsSold: Number(row.units),
    }));
  }

  /**
   * Active positions with stock in `[0, threshold]`, lowest first — sold-out
   * (`stock = 0`) positions are the single most urgent restock signal, so they
   * are included and, via `orderBy: { stock: 'asc' }`, float to the very top
   * (TASK-253). The `CHECK (stock >= 0)` constraint means dropping the old
   * `gt: 0` filter can never admit negative rows.
   */
  private async getLowStockProducts(threshold: number, limit: number): Promise<LowStockProduct[]> {
    const products = await this.prisma.product.findMany({
      where: { stock: { lte: threshold }, isActive: true, deletedAt: null },
      orderBy: { stock: 'asc' },
      take: limit,
      select: { id: true, name: true, stock: true },
    });
    return products.map((product) => ({
      productId: product.id,
      productName: product.name,
      stock: product.stock,
    }));
  }

  /** Coerce raw-query numeric columns to JS numbers defensively. */
  private normalizeSeries(rows: DailyRow[]): DailyDataPoint[] {
    return rows.map((row) => ({ date: row.date, value: Number(row.value) }));
  }
}
