import { Injectable, NotFoundException } from '@nestjs/common';
import { CategoryRepository } from '../category/category.repository';
import { DeviceRepository } from '../device/device.repository';
import { DeviceModelEntity } from '../device/entities';
import type { ProductListWhereParams } from '../product/product-list-where';
import { CatalogLandingRepository } from './catalog-landing.repository';
import { CompatLandingDetailEntity, CompatLandingPageEntity } from './entities';

/**
 * The visibility scope every compatibility landing page is measured in — the
 * SAME two flags `ProductService.findAll` forces on a public read: live and
 * active products only (`isActive`), and none belonging to a category that was
 * withdrawn from sale (`categoryActiveOnly`, TASK-297).
 *
 * A module constant rather than an inline literal at two call sites, because
 * the list and the single-page check MUST measure the same thing: the moment
 * they disagree, either a page is published that renders empty or a page that
 * renders fine is missing from the sitemap.
 */
const PUBLIC_SCOPE: ProductListWhereParams = { isActive: true, categoryActiveOnly: true };

/**
 * CatalogLandingService — which compatibility landing pages exist, and what one
 * of them is made of (TASK-490, plan 182 F3 / owner decision B-10 §5).
 *
 * ── The one dimension ───────────────────────────────────────────────────────
 * Pretty URLs carry compatibility and nothing else: `/catalog/<категорія>/
 * <модель>`, "Чохли для iPhone 15 Pro", because that is how the query is
 * actually phrased. Every other facet stays a query parameter that canonicalises
 * back onto the category and is `noindex` — the deliberate line against a farm
 * of hundreds of near-identical, mostly empty pages, and the same limit Rozetka
 * and Allo hold.
 *
 * ── Why a pair rolls UP the category tree ───────────────────────────────────
 * A page's listing is `?category=<slug>&device=<slug>`, and the catalogue's
 * category filter is a SUBTREE rollup (TASK-236): «Чохли» returns the products
 * of «Чохли для смартфонів» too. So a product filed in a leaf makes a page exist
 * at that leaf AND at every ancestor above it. Counting only a product's own
 * category would 404 pages that, when opened, list products — the worst of the
 * two possible mistakes, because it is invisible in the sitemap and visible to
 * the shopper.
 *
 * A DEACTIVATED ancestor is skipped as a page (the category itself is withdrawn
 * from sale, and `/categories/<slug>` already 404s it) but the walk CONTINUES
 * past it: its still-active grandparent's listing does roll those products up,
 * so its page is real.
 */
@Injectable()
export class CatalogLandingService {
  constructor(
    private readonly landingRepository: CatalogLandingRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly deviceRepository: DeviceRepository,
  ) {}

  /**
   * Every compatibility landing page that currently exists, sorted by
   * `(categorySlug, deviceSlug)` so the sitemap is byte-stable between requests.
   *
   * Four reads total, none of them per-pair: the compat aggregate, one batched
   * ancestor-chain CTE, one category read for the chains' links, one device-model
   * read for the pairs' models.
   */
  async getCompatPages(): Promise<CompatLandingPageEntity[]> {
    const pairs = await this.landingRepository.countCompatPairs(PUBLIC_SCOPE);
    if (pairs.length === 0) {
      return [];
    }

    const ownCategoryIds = [...new Set(pairs.map((pair) => pair.categoryId))];
    const chains = await this.categoryRepository.findAncestorChainsOrdered(ownCategoryIds);

    // Every link of every chain, resolved once — the chain is ids only.
    const linkIds = [...new Set([...chains.values()].flat())];
    const categories = await this.categoryRepository.findByIds(linkIds);
    const categoryById = new Map(categories.map((category) => [category.id, category]));

    // (categoryId, deviceModelId) → count, after the rollup.
    const rolled = new Map<string, { categoryId: string; deviceModelId: string; count: number }>();
    for (const pair of pairs) {
      for (const categoryId of chains.get(pair.categoryId) ?? [pair.categoryId]) {
        const category = categoryById.get(categoryId);
        // Missing = the chain named a row that no longer exists; inactive = a
        // category withdrawn from sale, which has no landing page of its own.
        // Neither stops the walk — an ancestor above may still be a real page.
        if (!category || !category.isActive) continue;

        const key = `${categoryId}|${pair.deviceModelId}`;
        const bucket = rolled.get(key);
        if (bucket) {
          bucket.count += pair.productCount;
        } else {
          rolled.set(key, {
            categoryId,
            deviceModelId: pair.deviceModelId,
            count: pair.productCount,
          });
        }
      }
    }

    const models = await this.deviceRepository.findModelsByIds([
      ...new Set([...rolled.values()].map((entry) => entry.deviceModelId)),
    ]);
    const modelById = new Map(models.map((model) => [model.id, model]));

    const pages: CompatLandingPageEntity[] = [];
    for (const entry of rolled.values()) {
      const category = categoryById.get(entry.categoryId);
      const model = modelById.get(entry.deviceModelId);
      if (!category || !model) continue;
      pages.push({
        categoryId: category.id,
        categorySlug: category.slug,
        categoryName: category.name,
        deviceModelId: model.id,
        deviceSlug: model.slug,
        deviceName: model.name,
        productCount: entry.count,
      });
    }

    return pages.sort(
      (a, b) =>
        a.categorySlug.localeCompare(b.categorySlug) || a.deviceSlug.localeCompare(b.deviceSlug),
    );
  }

  /**
   * One landing page, or a 404.
   *
   * The 404 is the substance of the method: a pair whose slice is empty must NOT
   * render an empty page — an indexed URL that promises «Чохли для iPhone 15
   * Pro» and shows nothing is worse than no URL at all. Every way of not
   * existing collapses to the same `NotFoundException`: unknown or deactivated
   * category, unknown or deactivated model, or a real pair with nothing in it.
   */
  async getCompatPage(
    categorySlug: string,
    deviceSlug: string,
  ): Promise<CompatLandingDetailEntity> {
    // `activeOnly` default (true): a deactivated category is withdrawn from
    // sale, so its compat page 404s exactly as `/categories/<slug>` does.
    const [category, model] = await Promise.all([
      this.categoryRepository.findBySlug(categorySlug),
      this.deviceRepository.findModelBySlug(deviceSlug),
    ]);
    if (!category || !model || !model.isActive) {
      throw new NotFoundException('Compatibility landing page not found');
    }

    // The SAME subtree rollup the listing on this page will run (TASK-236), so
    // the count and the page agree by construction.
    const categoryIds = await this.categoryRepository.findSubtreeIds(category.id);
    const productCount = await this.landingRepository.countPairProducts(categoryIds, model.id);
    if (productCount === 0) {
      throw new NotFoundException('Compatibility landing page not found');
    }

    return {
      categoryId: category.id,
      categorySlug: category.slug,
      categoryName: category.name,
      deviceModel: DeviceModelEntity.fromPrisma(model),
      productCount,
    };
  }
}
