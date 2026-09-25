import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { buildProductListWhere } from '../product/product-list-where';
import { publicProductSql } from '../product/product-visibility';

/** One (category × device model) bucket: the pair and how many products sit in it. */
export interface CompatPairCount {
  /** The product's OWN category — the rollup through ancestors happens in the service. */
  categoryId: string;
  deviceModelId: string;
  productCount: number;
}

/**
 * CatalogLandingRepository — the Prisma half of the compatibility landing pages
 * (TASK-490, plan 182 F3): `/catalog/<категорія>/<модель>`, «Чохли для iPhone
 * 15 Pro».
 *
 * ── Why the visibility scope is not written here ────────────────────────────
 * The single-page count narrows through {@link buildProductListWhere}, the one
 * listing `where` builder TASK-489 extracted; the all-pairs aggregate, which
 * Prisma cannot express, uses that predicate's SQL twin `publicProductSql`
 * (TASK-711) rather than a hand-written copy. That is not tidiness, it is the
 * acceptance criterion: «кількість сторінок = активні пари з ≥1 товаром» only
 * holds while "≥1 товар" means exactly what the listing on that page will show.
 * A second, hand-written predicate here is how a page gets published for a
 * catalogue slice that renders empty — the TASK-297 leak (products of a
 * deactivated category) in a new place.
 */
@Injectable()
export class CatalogLandingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Count the visible products behind EVERY (own category × compatible device
   * model) pair in one read — the single source that decides both which pages
   * exist and what the sitemap lists.
   *
   * Always the PUBLIC scope — the only scope a landing page is ever measured in.
   *
   * ONE `GROUP BY` in Postgres (TASK-711): the result is one row per pair, not
   * one per (product, compatible model). Prisma's `groupBy` cannot express it —
   * it groups only by scalar columns of the grouped model, and the two halves of
   * this pair live on different tables (`product_device_compat.device_model_id`
   * and `products.category_id`) — so this is raw SQL. The visibility half is NOT
   * restated by hand: it is {@link publicProductSql}, the SQL twin that sits
   * beside `PUBLIC_PRODUCT_WHERE` and is typed against its keys, and the
   * int-spec proves this aggregate equal to a tally over
   * `buildProductListWhere` on every hidden-product case.
   *
   * `COUNT(*)` counts products: `(product_id, device_model_id)` is the compat
   * table's primary key, so a product is in a pair at most once.
   *
   * `dm.is_active = true` matches the PUBLIC device list (`GET /device-models`,
   * active-only): a model the storefront's own filter will not offer must not
   * have a landing page either. The owning device BRAND is deliberately not
   * consulted — no public read filters on it today, and inventing that rule only
   * here would make this endpoint disagree with the device picker.
   */
  async countCompatPairs(): Promise<CompatPairCount[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ categoryId: string; deviceModelId: string; productCount: number | bigint }>
    >(Prisma.sql`
      SELECT p.category_id AS "categoryId",
             pdc.device_model_id AS "deviceModelId",
             COUNT(*)::int AS "productCount"
      FROM product_device_compat pdc
      JOIN products p ON p.id = pdc.product_id
      JOIN categories c ON c.id = p.category_id
      JOIN device_models dm ON dm.id = pdc.device_model_id
      WHERE ${publicProductSql({ product: 'p', category: 'c' })}
        AND dm.is_active = true
      GROUP BY p.category_id, pdc.device_model_id
    `);

    return rows.map((row) => ({
      categoryId: row.categoryId,
      deviceModelId: row.deviceModelId,
      productCount: Number(row.productCount),
    }));
  }

  /**
   * Count the visible products of ONE landing page — the category's whole
   * subtree crossed with one device model.
   *
   * The existence check for a single page, kept separate from
   * {@link countCompatPairs} so opening «Чохли для iPhone 15 Pro» costs one
   * indexed `COUNT`, not an aggregate over the entire compat table. They cannot
   * disagree: both narrow through the same builder, and the subtree id set here
   * is the same rollup the list performs by walking ancestor chains.
   */
  countPairProducts(categoryIds: string[], deviceModelId: string): Promise<number> {
    return this.prisma.product.count({
      where: buildProductListWhere({
        categoryIds,
        deviceModelId,
        isActive: true,
        categoryActiveOnly: true,
      }),
    });
  }
}
