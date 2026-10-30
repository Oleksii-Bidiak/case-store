import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { buildProductListWhere, publicProductSql } from '../product';

/** One (category × device model) bucket: the pair and how many products sit in it. */
export interface CompatPairCount {
  /** The product's OWN category — the rollup through ancestors happens in the service. */
  categoryId: string;
  deviceModelId: string;
  productCount: number;
}

/**
 * One row of the model hub read (TASK-1954): a product among the first few of
 * its top-level category group, with the group's full size alongside.
 */
export interface DeviceHubRow {
  /** The TOP-LEVEL category the product's own category hangs under. */
  groupCategoryId: string;
  productId: string;
  /** 1-based position inside the group (catalogue default order). */
  rank: number;
  /** Visible compatible products in the whole group — repeated on every row. */
  productCount: number;
}

/**
 * Recursion bound for the top-down category walk. Mirrors the bound every
 * other tree walk carries (`CategoryRepository`'s `MAX_CATEGORY_DEPTH`): the
 * real tree is two levels deep, so this only ever stops a corrupted one.
 */
const HUB_MAX_CATEGORY_DEPTH = 50;

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
   * Everything the model hub (TASK-1954) needs from the products table, in ONE
   * query: for each TOP-LEVEL category, how many visible products compatible
   * with `deviceModelId` sit anywhere in its subtree, and the ids of the first
   * `perGroup` of them.
   *
   * ── Why one query with window functions ─────────────────────────────────────
   * The alternative is one `findMany({ take: perGroup })` per category — a
   * query count that grows with the catalogue tree (an N+1 over groups). Here
   * `ROW_NUMBER() OVER (PARTITION BY root)` picks the head of every group and
   * `COUNT(*) OVER (PARTITION BY root)` measures it, so the hub costs the same
   * single round trip whether the model has two groups or twenty. The rows come
   * back already capped (`rank <= perGroup`), so the payload is bounded by
   * groups × perGroup, never by the model's whole assortment.
   *
   * ── Why the group is the ROOT category ──────────────────────────────────────
   * Products are filed in leaves («Чохли для iPhone»), but the hub reads in
   * top-level terms («Чохли», «Захисне скло», «Зарядні пристрої»), and a group
   * links to the landing `/catalog/<root>/<model>`, which rolls the subtree up
   * (TASK-236) — so the group count and the landing count agree by
   * construction. The root of a VISIBLE product is always active: the public
   * predicate requires `ancestors_active` (TASK-1032). The `roots` CTE walks the
   * tree top-down from every root; that cannot loop (a cycle has no root to start
   * from) and is bounded by depth anyway, like every other walk in the codebase.
   *
   * Order inside a group is the catalogue's default (in stock first, newest
   * first, `id` as the tiebreak — `ProductRepository.findAll` with
   * `inStockFirst`), so the hub previews what the landing opens on.
   *
   * Visibility is {@link publicProductSql} — the same twin the sitemap aggregate
   * uses — so a hidden product can never be counted or shown here.
   */
  async findDeviceHubRows(deviceModelId: string, perGroup: number): Promise<DeviceHubRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        groupCategoryId: string;
        productId: string;
        rank: number | bigint;
        productCount: number | bigint;
      }>
    >(Prisma.sql`
      WITH RECURSIVE roots AS (
        SELECT c.id, c.id AS root_id, 0 AS depth
        FROM categories c
        WHERE c.parent_id IS NULL
        UNION ALL
        SELECT c.id, r.root_id, r.depth + 1
        FROM categories c
        JOIN roots r ON c.parent_id = r.id
        WHERE r.depth < ${HUB_MAX_CATEGORY_DEPTH}
      ),
      ranked AS (
        SELECT p.id AS product_id,
               r.root_id,
               ROW_NUMBER() OVER (
                 PARTITION BY r.root_id
                 ORDER BY (p.stock > 0) DESC, p.created_at DESC, p.id ASC
               ) AS group_rank,
               COUNT(*) OVER (PARTITION BY r.root_id) AS product_count
        FROM product_device_compat pdc
        JOIN products p ON p.id = pdc.product_id
        JOIN categories c ON c.id = p.category_id
        JOIN roots r ON r.id = p.category_id
        WHERE pdc.device_model_id = ${deviceModelId}
          AND ${publicProductSql({ product: 'p', category: 'c' })}
      )
      SELECT root_id AS "groupCategoryId",
             product_id AS "productId",
             group_rank::int AS "rank",
             product_count::int AS "productCount"
      FROM ranked
      WHERE group_rank <= ${perGroup}
      ORDER BY root_id, group_rank
    `);

    return rows.map((row) => ({
      groupCategoryId: row.groupCategoryId,
      productId: row.productId,
      rank: Number(row.rank),
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
        deviceModelIds: [deviceModelId],
        isActive: true,
        categoryActiveOnly: true,
      }),
    });
  }
}
