import { AddonDeltaType } from '@prisma/client';

/**
 * Where a resolved add-on's effective value came from (TASK-174). Powers the
 * admin product-form badges (`шаблон` / `перевизначено` / `ексклюзив`) and is
 * inert for the storefront, which only renders name + price.
 */
export type AddonSource = 'template' | 'add' | 'override';

/**
 * One add-on service that applies to a product, after nearest-ancestor template
 * resolution and per-product delta application (TASK-174).
 *
 * `price` is the EFFECTIVE price as a two-decimal string — the catalog price, or
 * the ADD/OVERRIDE delta's own price when it carries one. Decimal values are
 * stringified (never floated) for the same reason `CartItemEntity.price` is.
 */
export interface ResolvedAddon {
  addonServiceId: string;
  name: string;
  description: string | null;
  price: string;
  source: AddonSource;
}

/**
 * Where a category's resolved template came from — `own` (the category declares
 * its own `CategoryAddonTemplate` rows), `inherited` (the nearest ancestor that
 * declares any does), or `none` (no category in the chain declares one).
 */
export type CategoryTemplateSource = 'own' | 'inherited' | 'none';

/**
 * Admin read view of a category's template resolution — backs the category
 * form's "успадковано з «Смартфони»" affordance.
 */
export interface ResolvedCategoryTemplate {
  source: CategoryTemplateSource;
  sourceCategoryId: string | null;
  addons: ResolvedAddon[];
}

/**
 * The catalog columns the resolver needs from a joined `AddonService` row.
 */
export interface AddonServiceRow {
  id: string;
  name: string;
  description: string | null;
  price: { toString(): string };
  isActive: boolean;
}

/**
 * A `CategoryAddonTemplate` row with its joined catalog service.
 */
export interface CategoryTemplateRow {
  categoryId: string;
  addonServiceId: string;
  addonService: AddonServiceRow;
}

/**
 * An `AddonServiceDelta` row with its joined catalog service.
 */
export interface ProductDeltaRow {
  productId: string;
  addonServiceId: string;
  type: AddonDeltaType;
  price: { toString(): string } | null;
  addonService: AddonServiceRow;
}

/**
 * The minimal product shape the resolver needs. `categoryId` is nullable in the
 * resolver's contract even though `Product.categoryId` is currently required —
 * a category-less product resolves an EMPTY base set (ADD deltas still surface).
 */
export interface ResolvableProduct {
  id: string;
  categoryId: string | null;
}
