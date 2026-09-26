import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { publicProductSql } from '../../product/product-visibility';
import { PrismaService } from '../../prisma';
import { ReportRange } from './report-period';
import { soldLinesSql } from './sales-base';

/** How leaders are chosen: by money for a holder of `analytics:revenue`, by units otherwise. */
export type LeaderRanking = 'revenue' | 'units';

/** One product's sold lines in a range. */
export interface ProductSales {
  productId: string;
  name: string;
  units: number;
  orders: number;
  /** Gross line amount (price × quantity). Cut by the caller without `analytics:revenue`. */
  revenue: number;
}

/** A published product that sold nothing in the range. */
export interface OutsiderRow {
  productId: string;
  name: string;
  stock: number;
  /** ISO timestamp — plain JSON, the report cache serialises. */
  createdAt: string;
}

/**
 * «Лідери й аутсайдери» in raw SQL (TASK-688, plan 188) — and the dashboard's
 * top products, which read {@link getLeaders} too (so "top 5" on the dashboard
 * and the report's leaders cannot disagree about what was sold).
 *
 * Sold lines come from `soldLinesSql`: the PAID / PARTIALLY_REFUNDED /
 * REFUNDED base, not PAID alone — a product whose order had one line refunded
 * no longer drops out of the ranking whole (the dashboard's old query did).
 */
@Injectable()
export class ProductsReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The `limit` best sellers of `range` (all time when `null`), ranked by
   * `rankedBy`. Ties fall back to units, then to the product id — never to
   * money when ranking by units, so nothing about revenue decides a list shown
   * to someone who may not see revenue.
   */
  async getLeaders(
    range: ReportRange | null,
    limit: number,
    rankedBy: LeaderRanking,
  ): Promise<ProductSales[]> {
    const orderBy =
      rankedBy === 'revenue'
        ? Prisma.sql`ORDER BY revenue DESC, units DESC, "productId" ASC`
        : Prisma.sql`ORDER BY units DESC, "productId" ASC`;

    return this.prisma.$queryRaw<ProductSales[]>`
      WITH sold AS (${soldLinesSql(range)})
      SELECT sold.product_id AS "productId",
             p.name,
             SUM(sold.quantity)::int AS units,
             COUNT(DISTINCT sold.order_id)::int AS orders,
             SUM(sold.amount)::float8 AS revenue
      FROM sold
      JOIN products p ON p.id = sold.product_id
      GROUP BY sold.product_id, p.name
      ${orderBy}
      LIMIT ${limit}
    `;
  }

  /** The same figures for given products in another range — the leaders' comparison. */
  async getSalesOf(range: ReportRange, productIds: string[]): Promise<ProductSales[]> {
    if (productIds.length === 0) return [];
    return this.prisma.$queryRaw<ProductSales[]>`
      WITH sold AS (${soldLinesSql(range)})
      SELECT sold.product_id AS "productId",
             p.name,
             SUM(sold.quantity)::int AS units,
             COUNT(DISTINCT sold.order_id)::int AS orders,
             SUM(sold.amount)::float8 AS revenue
      FROM sold
      JOIN products p ON p.id = sold.product_id
      WHERE sold.product_id IN (${Prisma.join(productIds)})
      GROUP BY sold.product_id, p.name
    `;
  }

  /**
   * Published products (on sale, not deleted, in an active category — the one
   * storefront rule, `publicProductSql`) with no sold line in `range`, oldest
   * first, plus how many there are in all.
   *
   * Counting from PUBLISHED products is the point (plan 188): counted from every
   * row, the list would be headed by positions taken off sale a year ago. A
   * product created after the range ended did not exist in it and is left out.
   */
  async getOutsiders(
    range: ReportRange,
    limit: number,
  ): Promise<{ total: number; rows: OutsiderRow[] }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ productId: string; name: string; stock: number; createdAt: Date; total: number }>
    >`
      WITH sold AS (${soldLinesSql(range)})
      SELECT p.id AS "productId",
             p.name,
             p.stock,
             p.created_at AS "createdAt",
             (COUNT(*) OVER ())::int AS total
      FROM products p
      JOIN categories category ON category.id = p.category_id
      WHERE ${publicProductSql({ product: 'p', category: 'category' })}
        AND p.created_at < ${range.end}
        AND NOT EXISTS (SELECT 1 FROM sold WHERE sold.product_id = p.id)
      ORDER BY p.created_at ASC, p.id ASC
      LIMIT ${limit}
    `;

    return {
      // The window count rides on every row; with no rows there are none.
      total: rows[0]?.total ?? 0,
      rows: rows.map(({ productId, name, stock, createdAt }) => ({
        productId,
        name,
        stock,
        createdAt: createdAt.toISOString(),
      })),
    };
  }
}
