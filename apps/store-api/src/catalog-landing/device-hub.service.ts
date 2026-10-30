import { Injectable, NotFoundException } from '@nestjs/common';
import { CategoryRepository } from '../category';
import { DeviceRepository } from '../device';
import { ProductService } from '../product';
import { CatalogLandingRepository } from './catalog-landing.repository';
import { DeviceHubEntity, DeviceHubGroupEntity } from './entities';

/** How many products a hub section previews (the rail shows 5; 8 leaves room). */
export const DEVICE_HUB_PRODUCTS_PER_GROUP = 8;

/**
 * DeviceHubService — «Все для <модель>» (TASK-1954): one device model's
 * accessories, grouped by top-level category, for the storefront page
 * `/devices/<модель>`.
 *
 * A hub is the union of the model's compatibility landing pages (TASK-490) at
 * the top level of the tree: every group links to `/catalog/<root>/<model>`
 * and counts exactly what that landing lists. So it shares the landing's rules
 * — active model only (the brand is not consulted, as on the landing and in the
 * public device picker), public products only — and its one way of answering
 * "there is nothing here": a 404.
 *
 * ── Query budget (fixed, independent of the number of groups) ────────────────
 *   1. the model + its brand (by slug);
 *   2. the grouped, ranked, capped product ids — ONE window-function query
 *      ({@link CatalogLandingRepository.findDeviceHubRows});
 *   3. the group categories, by id;
 *   4. the cards — {@link ProductService.getCardsByIds}, the very hydration
 *      `GET /products/cards` runs (its own fixed set of batched reads,
 *      including the one `compatibleDeviceModelIds` query).
 * No step is per group or per product.
 */
@Injectable()
export class DeviceHubService {
  constructor(
    private readonly landingRepository: CatalogLandingRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly deviceRepository: DeviceRepository,
    private readonly productService: ProductService,
  ) {}

  async getDeviceHub(deviceSlug: string): Promise<DeviceHubEntity> {
    const model = await this.deviceRepository.findModelBySlugWithBrand(deviceSlug);
    if (!model || !model.isActive) {
      throw new NotFoundException('Device hub not found');
    }

    const rows = await this.landingRepository.findDeviceHubRows(
      model.id,
      DEVICE_HUB_PRODUCTS_PER_GROUP,
    );
    if (rows.length === 0) {
      throw new NotFoundException('Device hub not found');
    }

    // Rows arrive ordered by (group, rank); keep that order per group.
    const byGroup = new Map<string, { productCount: number; productIds: string[] }>();
    for (const row of rows) {
      const group = byGroup.get(row.groupCategoryId);
      if (group) {
        group.productIds.push(row.productId);
      } else {
        byGroup.set(row.groupCategoryId, {
          productCount: row.productCount,
          productIds: [row.productId],
        });
      }
    }

    const [categories, cards] = await Promise.all([
      this.categoryRepository.findByIds([...byGroup.keys()]),
      this.productService.getCardsByIds(rows.map((row) => row.productId)),
    ]);
    const cardById = new Map(cards.map((card) => [card.id, card]));

    const entries: Array<{ group: DeviceHubGroupEntity; sortOrder: number }> = [];
    for (const category of categories) {
      // A visible product's root is always active (`ancestorsActive`, TASK-1032);
      // this re-check only guards a category toggled between the two reads.
      if (!category.isActive || category.deletedAt) continue;
      const group = byGroup.get(category.id);
      if (!group) continue;
      const products = group.productIds
        .map((id) => cardById.get(id))
        .filter((card): card is NonNullable<typeof card> => card != null);
      if (products.length === 0) continue;
      entries.push({
        group: {
          category: { id: category.id, name: category.name, slug: category.slug },
          productCount: group.productCount,
          products,
        },
        sortOrder: category.sortOrder,
      });
    }

    if (entries.length === 0) {
      throw new NotFoundException('Device hub not found');
    }

    const groups = entries
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.group.category.name.localeCompare(b.group.category.name, 'uk'),
      )
      .map((entry) => entry.group);

    return {
      model: {
        id: model.id,
        name: model.name,
        slug: model.slug,
        brandName: model.brand.name,
        brandSlug: model.brand.slug,
        series: model.series,
        metaTitle: model.metaTitle,
        metaDescription: model.metaDescription,
        description: model.description,
      },
      productCount: groups.reduce((sum, group) => sum + group.productCount, 0),
      groups,
    };
  }
}
