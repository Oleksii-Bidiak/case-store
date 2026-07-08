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
  /** Serialized structured-spec facet ("key:value"), TASK-191. */
  specs?: string;
  /** On-sale filter (compareAtPrice > price), TASK-179. */
  onSale?: boolean;
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
  'sortBy',
  'sortOrder',
];

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

    segments.push(`${field}=${String(value)}`);
  }

  return `${PRODUCT_LIST_PREFIX}:${segments.join('|')}`;
}
