import { Injectable, Logger } from '@nestjs/common';
import { AddonServiceRepository } from './addon-service.repository';
import { CategoryRepository } from '../category';
import type {
  AddonServiceRow,
  CategoryTemplateRow,
  ProductDeltaRow,
  ResolvableProduct,
  ResolvedAddon,
  ResolvedCategoryTemplate,
} from './addon-service.types';

/**
 * Format a Decimal-ish price as a two-decimal string ("499" → "499.00").
 * Prisma's Decimal normalises trailing zeros away on `toString()`; the resolved
 * price is a display/derivation value, so it is padded once, here, rather than
 * at every call site (see the TASK-281 merchant-feed padding bug).
 */
function formatPrice(value: { toString(): string }): string {
  const cents = Math.round(parseFloat(value.toString()) * 100);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, '0')}`;
}

/**
 * Resolves which add-on services apply to a product (TASK-174, plan 150) —
 * the heart of the feature.
 *
 * Two composable steps, in order:
 *
 *   1. **Nearest-ancestor-wins template lookup.** Walk the product's category's
 *      ORDERED ancestor chain (self, parent, grandparent, …) and take the FIRST
 *      category that owns at least one `CategoryAddonTemplate` row. That
 *      category's template becomes the base set — it fully SHADOWS anything a
 *      further ancestor declares (JS prototype own-property semantics, not a
 *      merge). A product with no category resolves an EMPTY base set.
 *
 *   2. **Per-product delta application.** `AddonServiceDelta` rows are applied
 *      on top of the base set:
 *        - `REMOVE` deletes an entry. Dangling (the service is no longer in the
 *          resolved template) → silent no-op, never an error: the template may
 *          have legitimately changed since the delta was created.
 *        - `OVERRIDE` replaces an existing entry's effective price. Dangling →
 *          the same silent no-op (logged at debug level, never thrown).
 *        - `ADD` inserts (or overwrites) an entry regardless of the base set —
 *          the "exclusive to this product" case, which doubles as the way to
 *          re-add something a REMOVE took out, with no extra mechanism.
 *
 * Finally, any entry whose `AddonService.isActive` is false is dropped, whatever
 * produced it — deactivating a service withdraws it everywhere, immediately.
 *
 * The class does no writes and owns no Prisma access: it reads through
 * {@link AddonServiceRepository} and {@link CategoryRepository}. The batched
 * entry point is the one the cart/order paths use — it is bounded at THREE
 * queries regardless of how many lines a cart has (no N+1).
 */
@Injectable()
export class AddonApplicabilityResolver {
  private readonly logger = new Logger(AddonApplicabilityResolver.name);

  constructor(
    private readonly addonServiceRepository: AddonServiceRepository,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  /**
   * Resolve the effective add-on set for ONE product. Delegates to
   * {@link resolveForProducts} so the single and batched entry points can never
   * drift apart (plan 150, resolver case 14).
   */
  async resolveForProduct(product: ResolvableProduct): Promise<ResolvedAddon[]> {
    const resolved = await this.resolveForProducts([product]);
    return resolved.get(product.id) ?? [];
  }

  /**
   * Batched form of {@link resolveForProduct} — every product in the batch gets
   * an entry in the returned map (an empty array when nothing applies).
   *
   * Exactly three queries, whatever the batch size: the ordered ancestor chains
   * of the distinct categories, the template rows of every category appearing in
   * any of those chains, and the delta rows of every product.
   */
  async resolveForProducts(products: ResolvableProduct[]): Promise<Map<string, ResolvedAddon[]>> {
    const resolved = new Map<string, ResolvedAddon[]>();
    if (products.length === 0) return resolved;

    const categoryIds = [
      ...new Set(products.map((p) => p.categoryId).filter((id): id is string => id !== null)),
    ];

    const chains = await this.categoryRepository.findAncestorChainsOrdered(categoryIds);

    const chainCategoryIds = [...new Set([...chains.values()].flat())];
    const templateRows = chainCategoryIds.length
      ? await this.addonServiceRepository.findTemplateRowsForCategories(chainCategoryIds)
      : [];
    const deltaRows = await this.addonServiceRepository.findDeltaRowsForProducts(
      products.map((p) => p.id),
    );

    const templatesByCategory = groupBy(templateRows, (row) => row.categoryId);
    const deltasByProduct = groupBy(deltaRows, (row) => row.productId);

    // One base set per distinct category — every product in that category shares
    // it, so the ancestor walk runs once per category, not once per product.
    const baseByCategory = new Map<string, ResolvedAddon[]>();
    for (const categoryId of categoryIds) {
      const chain = chains.get(categoryId) ?? [categoryId];
      const owner = chain.find((id) => (templatesByCategory.get(id)?.length ?? 0) > 0);
      baseByCategory.set(categoryId, this.toBaseSet(templatesByCategory.get(owner ?? '') ?? []));
    }

    for (const product of products) {
      const base = product.categoryId ? (baseByCategory.get(product.categoryId) ?? []) : [];
      const deltas = deltasByProduct.get(product.id) ?? [];
      resolved.set(product.id, this.applyDeltas(base, deltas, product.id));
    }

    return resolved;
  }

  /**
   * Admin read view (plan 150 §API Contract): does this category declare its own
   * add-on template, inherit one from an ancestor, or have none at all?
   *
   * `addons` is the resolved template BEFORE any product delta — deltas are a
   * property of a product, not of a category.
   */
  async resolveTemplateForCategory(categoryId: string): Promise<ResolvedCategoryTemplate> {
    const chains = await this.categoryRepository.findAncestorChainsOrdered([categoryId]);
    const chain = chains.get(categoryId) ?? [categoryId];

    const templateRows = await this.addonServiceRepository.findTemplateRowsForCategories(chain);
    const templatesByCategory = groupBy(templateRows, (row) => row.categoryId);

    const owner = chain.find((id) => (templatesByCategory.get(id)?.length ?? 0) > 0);
    if (!owner) {
      return { source: 'none', sourceCategoryId: null, addons: [] };
    }

    return {
      source: owner === categoryId ? 'own' : 'inherited',
      sourceCategoryId: owner,
      addons: this.toBaseSet(templatesByCategory.get(owner) ?? []),
    };
  }

  /**
   * Turn the winning category's template rows into resolved entries, dropping
   * services an admin has deactivated. A category whose whole template is
   * deactivated still COUNTS as owning a template (it shadows its ancestors) —
   * it just resolves to an empty set. That is deliberate: "own" is a structural
   * property of the rows, not of the catalog state behind them.
   */
  private toBaseSet(rows: CategoryTemplateRow[]): ResolvedAddon[] {
    return rows
      .filter((row) => row.addonService.isActive)
      .map((row) => this.toResolved(row.addonService, 'template', null))
      .sort(byName);
  }

  private applyDeltas(
    base: ResolvedAddon[],
    deltas: ProductDeltaRow[],
    productId: string,
  ): ResolvedAddon[] {
    const entries = new Map(base.map((addon) => [addon.addonServiceId, { ...addon }]));

    for (const delta of deltas) {
      const existing = entries.get(delta.addonServiceId);

      switch (delta.type) {
        case 'REMOVE':
          // Dangling REMOVE (nothing to remove) is a no-op by design, not an error.
          entries.delete(delta.addonServiceId);
          break;

        case 'OVERRIDE':
          if (!existing) {
            this.logger.debug(
              `Inert OVERRIDE delta: product ${productId} overrides add-on ${delta.addonServiceId}, which its resolved template no longer contains`,
            );
            break;
          }
          if (!delta.addonService.isActive) break;
          existing.price = formatPrice(delta.price ?? delta.addonService.price);
          existing.source = 'override';
          break;

        case 'ADD':
          // ADD is independent of the template: it also re-adds a REMOVEd entry.
          if (!delta.addonService.isActive) break;
          entries.set(
            delta.addonServiceId,
            this.toResolved(delta.addonService, 'add', delta.price),
          );
          break;
      }
    }

    return [...entries.values()].sort(byName);
  }

  private toResolved(
    service: AddonServiceRow,
    source: ResolvedAddon['source'],
    price: { toString(): string } | null,
  ): ResolvedAddon {
    return {
      addonServiceId: service.id,
      name: service.name,
      description: service.description,
      price: formatPrice(price ?? service.price),
      source,
    };
  }
}

/** Stable, locale-independent output order — the storefront renders as-is. */
function byName(a: ResolvedAddon, b: ResolvedAddon): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(key(row));
    if (bucket) bucket.push(row);
    else grouped.set(key(row), [row]);
  }
  return grouped;
}
