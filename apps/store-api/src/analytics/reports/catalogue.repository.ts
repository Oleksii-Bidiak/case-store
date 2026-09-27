import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { ReportRange } from './report-period';
import { soldLinesSql } from './sales-base';

/** Sold lines of one catalogue slice (a category subtree or a brand) in a range. */
export interface CatalogueSales {
  units: number;
  orders: number;
  /** Gross line amount (price × quantity). Cut by the service without `analytics:revenue`. */
  revenue: number;
}

export interface CategorySalesRow extends CatalogueSales {
  categoryId: string;
  name: string;
  /**
   * `true` for the "sold directly in this category" row of an expansion — the
   * products that sit on the expanded category itself, not in any child.
   */
  direct: boolean;
  /** Whether this row can be expanded further (it has child categories). */
  hasChildren: boolean;
}

export interface BrandSalesRow extends CatalogueSales {
  /** `null` is «Без бренду» — `products.brand_id` is nullable, and that row must exist. */
  brandId: string | null;
  name: string | null;
}

/**
 * «Продажі за категорією і брендом» in raw SQL (TASK-687, plan 188).
 *
 * **Category and brand are read as they are NOW.** `order_items` stores
 * neither, only `product_id`, so a line is attributed to the category its
 * product sits in today (owner decision B-8 №6: nothing is frozen). The answer
 * carries `basis: 'current-catalogue'` and the screen says «за нинішньою
 * структурою каталогу».
 *
 * **Categories are subtrees.** A row per root category (or per child of the
 * category being expanded) with the sum over its WHOLE subtree — «Чохли» as a
 * direction, not scattered over its leaves. The walk is a recursive CTE with
 * `UNION` (not `UNION ALL`): the same cycle-safe form as
 * `CategoryRepository.findDescendantIds` (TASK-238), so a corrupt parent loop
 * ends instead of spinning.
 *
 * A category is listed when it is active or when it sold something in the
 * range: a category switched off after selling still owns that money, and one
 * switched off that sold nothing is noise.
 *
 * A deleted category (TASK-653) is never a row and never makes its parent
 * expandable. The subtree walk still descends through it on purpose: deletion
 * moves every product out first, so it adds nothing — and if that invariant
 * ever broke, the money would stay in the live ancestor's total instead of
 * vanishing from the report.
 */
@Injectable()
export class CatalogueRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rows for the roots (`parentId = null`) or for the direct children of
   * `parentId`, each summed over its subtree; with a `parentId`, plus one
   * `direct` row for products placed on the parent itself when it sold any.
   */
  async getCategorySales(range: ReportRange, parentId: string | null): Promise<CategorySalesRow[]> {
    const anchors =
      parentId === null ? Prisma.sql`c.parent_id IS NULL` : Prisma.sql`c.parent_id = ${parentId}`;

    const subtreeRows = await this.prisma.$queryRaw<CategorySalesRow[]>`
      WITH RECURSIVE tree AS (
        SELECT c.id, c.id AS anchor_id
        FROM categories c
        WHERE ${anchors}
        UNION
        SELECT child.id, tree.anchor_id
        FROM categories child
        JOIN tree ON child.parent_id = tree.id
      ),
      sold AS (${soldLinesSql(range)}),
      per_anchor AS (
        SELECT tree.anchor_id,
               SUM(sold.quantity) AS units,
               COUNT(DISTINCT sold.order_id) AS orders,
               SUM(sold.amount) AS revenue
        FROM tree
        JOIN products p ON p.category_id = tree.id
        JOIN sold ON sold.product_id = p.id
        GROUP BY tree.anchor_id
      )
      SELECT c.id AS "categoryId",
             c.name,
             FALSE AS direct,
             EXISTS (
               SELECT 1 FROM categories ch WHERE ch.parent_id = c.id AND ch.deleted_at IS NULL
             ) AS "hasChildren",
             COALESCE(pa.units, 0)::int AS units,
             COALESCE(pa.orders, 0)::int AS orders,
             COALESCE(pa.revenue, 0)::float8 AS revenue
      FROM categories c
      LEFT JOIN per_anchor pa ON pa.anchor_id = c.id
      WHERE ${anchors}
        AND c.deleted_at IS NULL
        AND (c.is_active OR COALESCE(pa.units, 0) > 0)
      ORDER BY c.sort_order, c.name
    `;

    if (parentId === null) return subtreeRows;

    const directRows = await this.prisma.$queryRaw<CategorySalesRow[]>`
      WITH sold AS (${soldLinesSql(range)})
      SELECT c.id AS "categoryId",
             c.name,
             TRUE AS direct,
             FALSE AS "hasChildren",
             SUM(sold.quantity)::int AS units,
             COUNT(DISTINCT sold.order_id)::int AS orders,
             SUM(sold.amount)::float8 AS revenue
      FROM categories c
      JOIN products p ON p.category_id = c.id
      JOIN sold ON sold.product_id = p.id
      WHERE c.id = ${parentId}
      GROUP BY c.id, c.name
    `;
    return [...subtreeRows, ...directRows];
  }

  /** A flat row per brand that sold in the range, «Без бренду» (`brandId: null`) included. */
  async getBrandSales(range: ReportRange): Promise<BrandSalesRow[]> {
    return this.prisma.$queryRaw<BrandSalesRow[]>`
      WITH sold AS (${soldLinesSql(range)})
      SELECT p.brand_id AS "brandId",
             b.name,
             SUM(sold.quantity)::int AS units,
             COUNT(DISTINCT sold.order_id)::int AS orders,
             SUM(sold.amount)::float8 AS revenue
      FROM sold
      JOIN products p ON p.id = sold.product_id
      LEFT JOIN brands b ON b.id = p.brand_id
      GROUP BY p.brand_id, b.name
    `;
  }

  /**
   * Whether `categoryId` names a live category — an expansion of nothing is a
   * 404, not an empty list. A deleted one (TASK-653) is missing, as on every
   * other category read path; `findFirst`, since `deletedAt` is not in the key.
   */
  async categoryExists(categoryId: string): Promise<boolean> {
    const found = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { id: true },
    });
    return found !== null;
  }
}
