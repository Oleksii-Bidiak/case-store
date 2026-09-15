import { Prisma } from '@prisma/client';
import type { SpecFacetFilter } from './dto/product-list-query.dto';

/**
 * The narrowing half of a catalogue listing query — everything that decides
 * WHICH products are in the result set, with nothing about pagination, ordering
 * or hydration (TASK-489).
 *
 * It was extracted out of `FindAllParams` (which now extends it) the moment a
 * SECOND reader appeared: the facet counters of
 * `AttributeDefinitionRepository.findValueCountsByKey` must count products over
 * exactly the slice the listing would return, minus the one facet being counted.
 * Re-deriving that slice there would have meant a second `where` builder, and a
 * second builder is a builder that drifts — the day someone adds a filter to the
 * listing and not to the counter, «Силікон (12)» starts leading to a page of 8.
 */
export interface ProductListWhereParams {
  /**
   * Category filter as an already-expanded id set (self + subtree). The service
   * resolves a single requested `categoryId` into this list via
   * `CategoryRepository.findSubtreeIds` (TASK-236) so filtering by a parent
   * category rolls up every product filed under it; the repository does not own
   * that cross-entity rule.
   */
  categoryIds?: string[];
  /**
   * Manufacturer filter (TASK-189). A single brand id, applied alongside the
   * category rollup in the same `where` clause so brand + category compose.
   */
  brandId?: string;
  /**
   * Device-compatibility filter (TASK-190): when set, only products with a
   * `ProductDeviceCompat` row for this device model are returned. Applied as a
   * nested relation filter through the join table.
   */
  deviceModelId?: string;
  isActive?: boolean;
  /**
   * Withdraw the products of DEACTIVATED categories from the result set
   * (TASK-297). `isActive: false` on a category means "removed from sale", so
   * every PUBLIC read passes `true` here; the admin listing leaves it unset and
   * keeps seeing the full catalogue (it is how an operator finds the products
   * stranded by the deactivation in the first place).
   *
   * Scope is the product's OWN category, not its ancestor chain — deactivation
   * deliberately does NOT cascade to descendant categories (the `setActiveMany`
   * owner decision), so neither does this filter.
   */
  categoryActiveOnly?: boolean;
  /** Keep only positions with zero free-to-sell stock (TASK-362). */
  outOfStock?: boolean;
  /**
   * Invert the tombstone filter: list the SOFT-DELETED products instead of the
   * live ones (TASK-427).
   *
   * OFF by default and set ONLY from `ProductService.adminFindAll`, exactly like
   * `searchIncludesSku` below and for a stricter version of the same reason:
   * `findAll` is shared by the public storefront listing and the admin table,
   * and a deleted product is one whose slug and sku have already been mangled
   * and freed for reuse — publishing those rows would resurrect withdrawn
   * positions on the storefront. A deleted product had to be reachable from
   * SOMEWHERE, though: before this flag the admin panel had no read at all that
   * could see one, so `DELETE` was an action with no way back to its own result.
   */
  deleted?: boolean;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  /**
   * Extend `search` to the internal article number (TASK-406, AD-PROD-08).
   *
   * OFF by default and set ONLY from `ProductService.adminFindAll`: `findAll` is
   * shared by the public storefront listing and the admin table, and an SKU is
   * an internal identifier — a supplier code, a stock label — that nobody
   * outside the shop should be able to probe for through the public search box.
   * The operator, on the other hand, looks a position up by exactly that number,
   * which is why the flag exists at all.
   */
  searchIncludesSku?: boolean;
  /**
   * Structured-spec facet filter (TASK-191; multi-value since TASK-414 / owner
   * decision B-10). One entry per requested facet, already parsed and capped by
   * `parseSpecFilters`.
   *
   * Semantics: values WITHIN a facet are OR-ed (one `value IN (...)`), facets
   * are AND-ed (one `where.AND` entry each) — "силікон or TPU, and a case".
   * Anything narrower would make a second facet silently discard the first.
   */
  specFilters?: SpecFacetFilter[];
  /**
   * Keep only positions with something free to sell, `stock > 0` (TASK-414) —
   * the storefront «В наявності» checkbox. The exact complement of
   * {@link ProductListWhereParams.outOfStock}, which wins when both are set (the
   * admin restock worklist is the more specific intent).
   */
  inStock?: boolean;
  /**
   * On-sale filter (TASK-179): keep only products whose `compareAtPrice` is set
   * and strictly greater than `price`. A same-row column-to-column comparison
   * Prisma's typed `where` can't express, so it is resolved via a raw-SQL id
   * prefetch ({@link ON_SALE_PRODUCT_IDS_SQL}) fed into `where.id IN (...)`.
   */
  onSale?: boolean;
}

/**
 * Ids of every product currently on sale — `compareAtPrice` set AND strictly
 * greater than `price` (TASK-179). A raw query because Prisma's typed `where`
 * can't compare two columns of the same row. Queries the real snake_case
 * table/columns (`products` / `compare_at_price` / `price`). No
 * `deleted_at`/`is_active` guard here: the caller ANDs these ids into the outer
 * `where`, which already enforces both — a soft-deleted or inactive on-sale row
 * simply intersects to nothing.
 *
 * Exported as the SQL rather than as a method so both readers of
 * {@link buildProductListWhere} run the identical predicate; each executes it
 * with its own Prisma client.
 */
export const ON_SALE_PRODUCT_IDS_SQL = Prisma.sql`SELECT id FROM products WHERE compare_at_price IS NOT NULL AND compare_at_price > price`;

/**
 * Build the `where` clause of a catalogue listing — the SINGLE definition of
 * "which products are in this slice", shared by the listing itself and by the
 * facet counters (TASK-489).
 *
 * Pure and synchronous: the one filter that needs a database round trip
 * (`onSale`) takes its already-resolved ids as the second argument, so a caller
 * can resolve them once and reuse them across the several counting queries one
 * page needs.
 *
 * @param onSaleIds ids from {@link ON_SALE_PRODUCT_IDS_SQL}; consulted only when
 * `params.onSale` is set. Absent while the filter is on means "nothing is on
 * sale", which is the correct empty slice rather than a silently wider one.
 */
export function buildProductListWhere(
  params: ProductListWhereParams,
  onSaleIds?: string[],
): Prisma.ProductWhereInput {
  // The tombstone filter is applied FIRST and is never absent: a listing either
  // shows the live products (`deletedAt: null` — every public read, and the
  // admin default) or exactly the soft-deleted ones (`deletedAt: { not: null }`
  // — the admin's TASK-427 «Лише видалені» filter). There is deliberately no
  // "both" mode: a mixed page cannot be read without a per-row deleted marker,
  // and the entity has none.
  const where: Prisma.ProductWhereInput = {
    deletedAt: params.deleted ? { not: null } : null,
  };

  // Subtree rollup (TASK-236): the service passes the expanded category id set
  // (self + descendants), matched with `IN (...)` so a parent category returns
  // its subcategories' products too.
  if (params.categoryIds !== undefined) {
    where.categoryId = { in: params.categoryIds };
  }

  // Manufacturer filter (TASK-189) — composes with the category rollup above.
  if (params.brandId !== undefined) {
    where.brandId = params.brandId;
  }

  // Device-compatibility filter (TASK-190): match products that have a compat
  // join row for the requested device model. The `@@index([deviceModelId])` on
  // `ProductDeviceCompat` covers this lookup direction.
  if (params.deviceModelId !== undefined) {
    where.deviceCompat = { some: { deviceModelId: params.deviceModelId } };
  }

  if (params.isActive !== undefined) {
    where.isActive = params.isActive;
  }

  // Storefront «В наявності» (TASK-414): only what can actually be bought.
  if (params.inStock) {
    where.stock = { gt: 0 };
  }

  // Restock worklist (TASK-362): positions with nothing free to sell.
  // Deliberately AFTER `inStock` so it wins if a caller somehow sends both —
  // the two are exact opposites, and the admin worklist is the more specific
  // intent. (The public path forces `outOfStock: undefined` anyway.)
  if (params.outOfStock) {
    where.stock = { lte: 0 };
  }

  // Withdraw the products of deactivated categories (TASK-297). A relation
  // filter, so it composes with the `categoryIds` subtree rollup above rather
  // than replacing it: a parent-category rollup still returns only the
  // products whose own category is on sale.
  if (params.categoryActiveOnly) {
    where.category = { isActive: true };
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    where.price = {};
    if (params.minPrice !== undefined) {
      (where.price as Prisma.DecimalFilter).gte = params.minPrice;
    }
    if (params.maxPrice !== undefined) {
      (where.price as Prisma.DecimalFilter).lte = params.maxPrice;
    }
  }

  if (params.search) {
    const searchOr: Prisma.ProductWhereInput[] = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { description: { contains: params.search, mode: 'insensitive' } },
    ];
    // The article number joins the search only on the admin path (TASK-406):
    // `searchIncludesSku` is set by `adminFindAll` and by nothing else, so the
    // public storefront listing — which shares this builder — cannot be used to
    // probe internal SKUs.
    if (params.searchIncludesSku) {
      searchOr.push({ sku: { contains: params.search, mode: 'insensitive' } });
    }
    where.OR = searchOr;
  }

  // Structured-spec facets (TASK-191, multi-value since TASK-414 / B-10).
  //
  // ONE `where.AND` entry PER FACET, each a `specValues.some(...)` over that
  // facet's value list. That shape is the whole point: `some` is an EXISTS
  // subquery, so a single `some` with two definition keys would ask for one
  // spec row matching both keys at once — never true. Separate entries ask for
  // one matching row per facet, which is the AND-between-facets /
  // OR-within-facet semantics the owner decided (B-10).
  //
  // `where.AND` is assigned here and NOWHERE else in this builder — every
  // other filter writes its own `where` key — so a plain assignment is safe;
  // if that ever stops being true this must become an append.
  if (params.specFilters && params.specFilters.length > 0) {
    where.AND = params.specFilters.map((facet) => ({
      specValues: { some: { value: { in: facet.values }, definition: { key: facet.key } } },
    }));
  }

  // On-sale (TASK-179): `compareAtPrice > price` is a same-row column-to-column
  // comparison Prisma's typed `where` cannot express, so the matching ids are
  // resolved with one raw query and AND-ed into `where.id`. Baked into `where`
  // BEFORE skip/take/count and BEFORE the bestselling branch, so it composes
  // with every other filter AND both sort paths, and pagination stays correct.
  if (params.onSale) {
    where.id = { in: onSaleIds ?? [] };
  }

  return where;
}
