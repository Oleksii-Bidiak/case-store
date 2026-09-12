/**
 * Cache key helpers for the product cache namespace.
 *
 * All product cache entries live under the `product:` prefix so they are
 * isolated from any future Redis usage (sessions, queues, etc.) and can be
 * cleared wholesale with a single `DEL product:*` if ever needed.
 *
 * The list-key builder is a PURE function: given the same logical query it
 * always returns the same string, regardless of the order in which the
 * parameter object was constructed. This is what makes the cache hit rate
 * predictable — two structurally identical queries map to one key.
 */

/** Root namespace for every product cache entry. */
export const PRODUCT_CACHE_PREFIX = 'product:';

/** Prefix shared by all paginated product-list cache entries. */
export const PRODUCT_LIST_PREFIX = 'product:list';

/** Prefix shared by all "detail by slug" cache entries. */
export const PRODUCT_DETAIL_SLUG_PREFIX = 'product:detail:slug';

/** Prefix shared by all "detail by id" cache entries. */
export const PRODUCT_DETAIL_ID_PREFIX = 'product:detail:id';

/**
 * Prefix shared by all public brand-list cache entries (TASK-414). Its own
 * namespace, not `product:`, so `delByPrefix(PRODUCT_LIST_PREFIX)` cannot
 * quietly clear it (or miss it) by accident — `ProductService` purges both
 * explicitly on every catalogue write, because filing a product under a brand
 * changes which brands a category offers.
 */
export const BRAND_LIST_PREFIX = 'brand:list';

/**
 * Cache key for the public brand list, optionally narrowed to a category
 * subtree. `all` (rather than an empty segment) marks the unfiltered list so
 * the two can never collide.
 */
export function brandListCategoryKey(categoryId?: string): string {
  return `${BRAND_LIST_PREFIX}:category=${categoryId ?? 'all'}`;
}

/** Cache key for a product-detail-by-slug response. */
export function productDetailSlugKey(slug: string): string {
  return `${PRODUCT_DETAIL_SLUG_PREFIX}:${slug}`;
}

/** Cache key for a product-detail-by-id response. */
export function productDetailIdKey(id: string): string {
  return `${PRODUCT_DETAIL_ID_PREFIX}:${id}`;
}

/**
 * Subset of the product-list query parameters that influence the result set
 * and therefore the cache key. Declared locally so the cache layer stays
 * decoupled from `ProductRepository`; the structurally-identical
 * `FindAllParams` passes without an explicit import.
 */
export interface ProductListKeyParams {
  page: number;
  limit: number;
  categoryId?: string;
  brandId?: string;
  deviceModelId?: string;
  isActive?: boolean;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  /**
   * Serialized structured-spec facets — "key:v1,v2;key2:v3" (TASK-191,
   * multi-value since TASK-414). CANONICALIZED by the key builder, so callers
   * need not sort anything; see {@link canonicalizeSpecs}.
   */
  specs?: string;
  /** On-sale filter (compareAtPrice > price), TASK-179. */
  onSale?: boolean;
  /** In-stock filter (stock > 0), TASK-414. */
  inStock?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Fixed serialization order. Iterating this list (rather than the object's own
 * keys) guarantees a deterministic key independent of object construction order.
 */
const KEY_FIELDS: ReadonlyArray<keyof ProductListKeyParams> = [
  'page',
  'limit',
  'categoryId',
  'brandId',
  'deviceModelId',
  'isActive',
  'minPrice',
  'maxPrice',
  'search',
  'specs',
  'onSale',
  'inStock',
  'sortBy',
  'sortOrder',
];

/**
 * Normalize a serialized spec-facet param to ONE canonical string.
 *
 * Without this, `?specs=material:Силікон,TPU` and `?specs=material:TPU,Силікон`
 * — the same filter, and the same result set — would produce two different keys
 * and two cache entries, and the order the checkboxes happen to be ticked in
 * would decide which one a shopper lands on. Sorting facets by key and values
 * within each facet collapses every equivalent spelling onto one entry.
 *
 * Sorting is by plain code-unit comparison, NOT `localeCompare`: a cache key
 * must not depend on the process locale.
 *
 * This is also where the multi-value grammar is re-validated for key purposes —
 * garbage chunks are dropped exactly as `parseSpecFilters` drops them, so a
 * malformed param can never fragment the cache away from its equivalent
 * well-formed one.
 */
function canonicalizeSpecs(raw: string): string {
  const byKey = new Map<string, Set<string>>();

  for (const chunk of raw.split(';')) {
    const idx = chunk.indexOf(':');
    if (idx <= 0) continue;

    const key = chunk.slice(0, idx).trim();
    if (key === '') continue;

    const values = chunk
      .slice(idx + 1)
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== '');
    if (values.length === 0) continue;

    const bucket = byKey.get(key) ?? new Set<string>();
    for (const value of values) bucket.add(value);
    byKey.set(key, bucket);
  }

  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, values]) => `${key}:${[...values].sort().join(',')}`)
    .join(';');
}

/**
 * Build a deterministic cache key for a paginated product-list query.
 *
 * - `undefined` / `null` values are omitted (not serialized as the literal
 *   string `"undefined"`).
 * - An empty-string `search` is treated as absent.
 */
export function buildProductListKey(params: ProductListKeyParams): string {
  const segments: string[] = [];

  for (const field of KEY_FIELDS) {
    const value = params[field];

    if (value === undefined || value === null) continue;
    if (field === 'search' && value === '') continue;

    if (field === 'specs') {
      const canonical = canonicalizeSpecs(String(value));
      // A param that parses to nothing filters nothing — it must map to the
      // SAME key as an absent one, not to `specs=`.
      if (canonical === '') continue;
      segments.push(`specs=${canonical}`);
      continue;
    }

    segments.push(`${field}=${String(value)}`);
  }

  return `${PRODUCT_LIST_PREFIX}:${segments.join('|')}`;
}
