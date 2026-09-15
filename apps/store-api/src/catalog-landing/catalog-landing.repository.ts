import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { buildProductListWhere, ProductListWhereParams } from '../product/product-list-where';

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
 * Both reads narrow through {@link buildProductListWhere}, the one listing
 * `where` builder TASK-489 extracted. That is not tidiness, it is the
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
   * One query, tallied in memory rather than a `groupBy`: Prisma can only group
   * by scalar columns OF THE GROUPED MODEL, and the two halves of this pair live
   * on different tables (`product_device_compat.device_model_id` and
   * `products.category_id`). The alternative was raw SQL — which would have had
   * to restate the visibility predicate by hand, i.e. exactly the drift this
   * class exists to avoid. The row set is one row per (product, compatible
   * model), the smallest join in the catalogue.
   *
   * `deviceModel: { isActive: true }` matches the PUBLIC device list
   * (`GET /device-models`, active-only): a model the storefront's own filter
   * will not offer must not have a landing page either. The owning device BRAND
   * is deliberately not consulted — no public read filters on it today, and
   * inventing that rule only here would make this endpoint disagree with the
   * device picker.
   */
  async countCompatPairs(params: ProductListWhereParams): Promise<CompatPairCount[]> {
    const rows = await this.prisma.productDeviceCompat.findMany({
      where: {
        product: buildProductListWhere(params),
        deviceModel: { isActive: true },
      },
      select: { deviceModelId: true, product: { select: { categoryId: true } } },
    });

    const tally = new Map<string, CompatPairCount>();
    for (const row of rows) {
      // `|` cannot occur in a uuid, so the composite key is unambiguous without
      // escaping either half.
      const key = `${row.product.categoryId}|${row.deviceModelId}`;
      const bucket = tally.get(key);
      if (bucket) {
        bucket.productCount += 1;
      } else {
        tally.set(key, {
          categoryId: row.product.categoryId,
          deviceModelId: row.deviceModelId,
          productCount: 1,
        });
      }
    }
    return [...tally.values()];
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
