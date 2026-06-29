import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import {
  DASHBOARD_WINDOW_DAYS,
  LOW_STOCK_LIMIT,
  LOW_STOCK_THRESHOLD,
  TOP_PRODUCTS_LIMIT,
  type DailyDataPoint,
  type DashboardSummary,
  type LowStockProduct,
  type OrderStatusCount,
  type TopProduct,
} from './dashboard.types';

/**
 * Revenue is counted only for orders the admin has actually marked PAID
 * (`paymentStatus = PAID`). Since TASK-151 decoupled payment status from the
 * order-status pipeline (`derivePaymentStatus` was removed), order status is no
 * longer a proxy for "money received" — an order can sit at CONFIRMED/PROCESSING
 * while still unpaid (e.g. cash-on-delivery awaiting collection). Every revenue
 * aggregate and the top-products list therefore filter on `paymentStatus = PAID`
 * so the dashboard reflects earned revenue, not merely accepted orders (TASK-152).
 *
 * Alongside earned revenue, TASK-137 adds an "unrealized" revenue pair
 * (`getUnrealizedRevenue` / `getUnrealizedRevenueSince`): the value of orders that
 * are still active but not yet paid (`paymentStatus != PAID` AND `status NOT IN
 * (CANCELLED, REFUNDED)`). This is the receivable pipeline — money expected but
 * not yet collected (e.g. COD awaiting collection, or a failed payment pending a
 * retry) — shown beside earned revenue so the admin can read both at a glance.
 */

/** Raw-query row shape for the gap-filled daily series. */
interface DailyRow {
  date: string;
  value: number;
}

/** Raw-query row shape for the top-products query. */
interface TopProductRow {
  productId: string;
  name: string;
  totalRevenue: number;
}

/**
 * Read-only repository assembling all admin-dashboard metrics from existing
 * tables. No writes, no migrations — every method is an aggregate query.
 *
 * Time-series methods use raw SQL with PostgreSQL `generate_series` +
 * `DATE_TRUNC` so the returned series always spans the full window (missing
 * days come back as 0 rather than gaps). The project is PostgreSQL-only across
 * all environments (Docker Compose dev + `store_test` e2e DB), so these raw
 * queries are safe — there is no SQLite fallback to consider.
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run every metric query in parallel and assemble the summary payload.
   */
  async getSummary(windowDays: number = DASHBOARD_WINDOW_DAYS): Promise<DashboardSummary> {
    const windowStart = this.windowStart(windowDays);

    const [
      totalRevenue,
      revenueLast30Days,
      unrealizedRevenue,
      unrealizedRevenueLast30Days,
      revenueByDay,
      totalOrders,
      ordersByStatus,
      ordersByDay,
      totalUsers,
      newUsersByDay,
      totalProducts,
      activeProducts,
      topProducts,
      lowStockProducts,
    ] = await Promise.all([
      this.getTotalRevenue(),
      this.getRevenueSince(windowStart),
      this.getUnrealizedRevenue(),
      this.getUnrealizedRevenueSince(windowStart),
      this.getRevenueByDay(windowDays),
      this.prisma.order.count(),
      this.getOrderCountByStatus(),
      this.getOrdersByDay(windowDays),
      this.prisma.user.count(),
      this.getNewUsersByDay(windowDays),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { isActive: true } }),
      this.getTopProducts(TOP_PRODUCTS_LIMIT),
      this.getLowStockProducts(LOW_STOCK_THRESHOLD, LOW_STOCK_LIMIT),
    ]);

    return {
      revenue: {
        totalRevenue,
        revenueLast30Days,
        unrealizedRevenue,
        unrealizedRevenueLast30Days,
        revenueByDay,
      },
      orders: { totalOrders, ordersByStatus, ordersByDay },
      users: { totalUsers, newUsersByDay },
      products: { totalProducts, activeProducts, topProducts },
      inventory: { lowStockProducts },
    };
  }

  /**
   * Start of the rolling window (midnight, `windowDays - 1` days ago).
   *
   * NOTE — timezone alignment: this uses the Node.js server's local timezone
   * (`new Date()` + `setHours(0,0,0,0)`), while the SQL series anchor
   * `DATE_TRUNC('day', NOW())` uses the PostgreSQL session timezone (UTC under
   * Docker Compose). When both the server and the DB run UTC — the standard
   * deployment here — the two coincide and the 30-day window is consistent.
   * If either is reconfigured to a non-UTC zone the boundaries can diverge by
   * up to ~24h. MVP assumption: both run UTC. To make this fully robust, drive
   * both the JS filter and the SQL series from a single UTC timestamp.
   */
  private windowStart(windowDays: number): Date {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (windowDays - 1));
    return start;
  }

  /** Lifetime revenue: sum of `Order.total` for PAID orders only (TASK-152). */
  private async getTotalRevenue(): Promise<number> {
    const result = await this.prisma.order.aggregate({
      _sum: { total: true },
      where: { paymentStatus: PaymentStatus.PAID },
    });
    return Number(result._sum.total ?? 0);
  }

  /** Revenue since a given date, PAID orders only (TASK-152). */
  private async getRevenueSince(since: Date): Promise<number> {
    const result = await this.prisma.order.aggregate({
      _sum: { total: true },
      where: { paymentStatus: PaymentStatus.PAID, createdAt: { gte: since } },
    });
    return Number(result._sum.total ?? 0);
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
      where: {
        paymentStatus: { not: PaymentStatus.PAID },
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
      },
    });
    return Number(result._sum.total ?? 0);
  }

  /** Unrealized revenue since a given date (same active-but-unpaid filter). */
  private async getUnrealizedRevenueSince(since: Date): Promise<number> {
    const result = await this.prisma.order.aggregate({
      _sum: { total: true },
      where: {
        paymentStatus: { not: PaymentStatus.PAID },
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
        createdAt: { gte: since },
      },
    });
    return Number(result._sum.total ?? 0);
  }

  /** Order counts grouped by status. */
  private async getOrderCountByStatus(): Promise<OrderStatusCount[]> {
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      _count: { id: true },
    });
    return grouped.map((row) => ({ status: row.status, count: row._count.id }));
  }

  /**
   * Daily revenue for the last `windowDays`, gap-filled to a complete series.
   * Counts PAID orders only, matching the revenue definition (TASK-152).
   */
  private async getRevenueByDay(windowDays: number): Promise<DailyDataPoint[]> {
    const rows = await this.prisma.$queryRaw<DailyRow[]>`
      SELECT TO_CHAR(d.day, 'YYYY-MM-DD') AS date,
             COALESCE(SUM(o.total), 0)::float8 AS value
      FROM generate_series(
             DATE_TRUNC('day', NOW()) - MAKE_INTERVAL(days => ${windowDays - 1}::int),
             DATE_TRUNC('day', NOW()),
             INTERVAL '1 day'
           ) AS d(day)
      LEFT JOIN orders o
        ON DATE_TRUNC('day', o.created_at) = d.day
        AND o.payment_status = 'PAID'
      GROUP BY d.day
      ORDER BY d.day ASC
    `;
    return this.normalizeSeries(rows);
  }

  /** Daily order count for the last `windowDays`, gap-filled. */
  private async getOrdersByDay(windowDays: number): Promise<DailyDataPoint[]> {
    const rows = await this.prisma.$queryRaw<DailyRow[]>`
      SELECT TO_CHAR(d.day, 'YYYY-MM-DD') AS date,
             COUNT(o.id)::int AS value
      FROM generate_series(
             DATE_TRUNC('day', NOW()) - MAKE_INTERVAL(days => ${windowDays - 1}::int),
             DATE_TRUNC('day', NOW()),
             INTERVAL '1 day'
           ) AS d(day)
      LEFT JOIN orders o
        ON DATE_TRUNC('day', o.created_at) = d.day
      GROUP BY d.day
      ORDER BY d.day ASC
    `;
    return this.normalizeSeries(rows);
  }

  /** Daily new-user registrations for the last `windowDays`, gap-filled. */
  private async getNewUsersByDay(windowDays: number): Promise<DailyDataPoint[]> {
    const rows = await this.prisma.$queryRaw<DailyRow[]>`
      SELECT TO_CHAR(d.day, 'YYYY-MM-DD') AS date,
             COUNT(u.id)::int AS value
      FROM generate_series(
             DATE_TRUNC('day', NOW()) - MAKE_INTERVAL(days => ${windowDays - 1}::int),
             DATE_TRUNC('day', NOW()),
             INTERVAL '1 day'
           ) AS d(day)
      LEFT JOIN users u
        ON DATE_TRUNC('day', u.created_at) = d.day
      GROUP BY d.day
      ORDER BY d.day ASC
    `;
    return this.normalizeSeries(rows);
  }

  /**
   * Top products by total revenue earned.
   *
   * Revenue is `SUM(price * quantity)` — multiplying by quantity matters, since
   * a line of 3 units at $10 earns $30, not $10. Prisma's `groupBy` can only
   * `_sum` a single column, so a raw query is used. The product name is joined
   * in the same query (no second lookup, no N+1).
   *
   * Only items from PAID orders count: the `INNER JOIN orders` filters
   * `payment_status = 'PAID'` so top-products revenue stays consistent with
   * `getTotalRevenue` (TASK-152 — earned revenue, not merely accepted orders;
   * order status is no longer a payment proxy after the TASK-151 decoupling).
   */
  private async getTopProducts(limit: number): Promise<TopProduct[]> {
    const rows = await this.prisma.$queryRaw<TopProductRow[]>`
      SELECT oi.product_id AS "productId",
             p.name AS name,
             SUM(oi.price * oi.quantity)::float8 AS "totalRevenue"
      FROM order_items oi
      INNER JOIN orders o
        ON o.id = oi.order_id
        AND o.payment_status = 'PAID'
      JOIN products p ON p.id = oi.product_id
      GROUP BY oi.product_id, p.name
      ORDER BY "totalRevenue" DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      totalRevenue: Number(row.totalRevenue),
    }));
  }

  /** Active positions with stock in `(0, threshold]`, lowest first. */
  private async getLowStockProducts(threshold: number, limit: number): Promise<LowStockProduct[]> {
    const products = await this.prisma.product.findMany({
      where: { stock: { gt: 0, lte: threshold }, isActive: true, deletedAt: null },
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
