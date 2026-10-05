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
 * Shape version of a cached VALUE, written into the key BELOW its purge prefix.
 *
 * Bump it in every key whose cached value changes shape. Redis outlives a deploy,
 * so without it the new code would read an entry the old code wrote and hand the
 * old shape on as if it were the new one — for the whole TTL. Sitting below the
 * prefix (`product:list:v2:…`, not `product:list-v2:…`) keeps
 * `delByPrefix(PRODUCT_LIST_PREFIX)` / `delByPrefix(BRAND_LIST_PREFIX)` purging
 * both generations, so nothing the old code left behind can outlive a write.
 *
 * `v2` (TASK-806): services stopped building the `{ data, meta }` response
 * envelope. The product listing caches `{ items, meta }`, the slug detail the bare
 * entity, the brand list the bare array. The id detail always cached the bare
 * entity and the facet counts never held an envelope, so their keys are unchanged.
 */
const VALUE_SHAPE_VERSION = 'v2';

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
  return `${BRAND_LIST_PREFIX}:${VALUE_SHAPE_VERSION}:category=${categoryId ?? 'all'}`;
}

/** Cache key for a product-detail-by-slug response. */
export function productDetailSlugKey(slug: string): string {
  return `${PRODUCT_DETAIL_SLUG_PREFIX}:${VALUE_SHAPE_VERSION}:${slug}`;
}

/** Cache key for a product-detail-by-id response. */
export function productDetailIdKey(id: string): string {
  return `${PRODUCT_DETAIL_ID_PREFIX}:${id}`;
}

/**
 * Subset of the product-list query parameters that influence the result set
 * and therefore the cache key. Declared locally so the cache layer stays
 * decoupled from `ProductRepository`.
 *
 * The three taxonomy axes are keyed by SLUG, not by id (TASK-420). The API
 * accepts both spellings — `?brand=apple` and the legacy `?brandId=<uuid>` —
 * and they name the same result set, so they MUST map to one entry: keying on
 * whichever the client happened to send would halve the hit rate of every
 * filtered listing (the TASK-541 class of bug). `ProductService` therefore
 * passes the canonical slug resolved by `CatalogueFilterResolver`, never the
 * raw query value and never the id. An axis that resolved to nothing is keyed
 * as `!unknown` — every dead value shares the one empty page's entry.
 *
 * `FindAllParams` is deliberately NOT structurally compatible any more: it
 * carries `brandId`/`deviceModelId`, which these fields no longer accept, so a
 * spread of it into this type is a compile error rather than a silently
 * fragmented cache.
 */
export interface ProductListKeyParams {
  page: number;
  limit: number;
  /** Canonical category SLUG (not id) — see the note above. */
  category?: string;
  /** Canonical brand SLUG (not id). */
  brand?: string;
  /** Canonical device-model SLUG (not id). */
  device?: string;
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
  'category',
  'brand',
  'device',
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

/** Boolean filters that narrow only when `true` (see {@link buildProductListKey}). */
const ON_ONLY_FIELDS: ReadonlySet<string> = new Set(['onSale', 'inStock']);

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
 * Escape a value so it cannot forge the `|` that separates key segments.
 *
 * `search` and `specs` are the only fields carrying shopper-supplied text, and
 * they are serialized BEFORE `onSale`/`inStock`/`sortBy`/`sortOrder`. Unescaped,
 * `?search=чохол|inStock=true` produced byte-identical key to
 * `?search=чохол&inStock=true` while running different SQL — so an empty page
 * could be written into the entry a real filtered query reads back, for every
 * visitor, for the whole TTL.
 *
 * Percent-escaping only `%` and `|` (rather than `encodeURIComponent`) keeps the
 * Cyrillic catalogue readable in `redis-cli --scan` while still being injective:
 * `%` is escaped first, so nothing else can produce a `%7C`.
 */
function encodeSegment(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('|', '%7C');
}

/**
 * Build a deterministic cache key for a paginated product-list query.
 *
 * - `undefined` / `null` values are omitted (not serialized as the literal
 *   string `"undefined"`).
 * - An empty-string `search` is treated as absent.
 * - `onSale: false` / `inStock: false` are treated as absent (TASK-541).
 */
export function buildProductListKey(params: ProductListKeyParams): string {
  return `${PRODUCT_LIST_PREFIX}:${VALUE_SHAPE_VERSION}:${serializeSegments(params, KEY_FIELDS)}`;
}

/**
 * The shared serializer behind every catalogue-slice key: fixed field order,
 * absent / empty / ON-only-`false` values dropped, specs canonicalized, shopper
 * text escaped. One implementation, so the listing and the facet key cannot
 * disagree about which two spellings are the same slice.
 */
function serializeSegments<T extends object>(params: T, fields: ReadonlyArray<keyof T>): string {
  const segments: string[] = [];

  for (const field of fields) {
    const value = params[field] as unknown;

    if (value === undefined || value === null) continue;
    if (field === 'search' && value === '') continue;
    // `onSale` / `inStock` are ON-only filters: `buildProductListWhere` tests
    // their truthiness, so `false` runs the same SQL as an absent param and
    // must share its entry (TASK-541) — otherwise a hand-written `=false` URL
    // splits one listing's hit rate in two. `isActive` is NOT one of them:
    // `false` there is a real, different slice.
    if (ON_ONLY_FIELDS.has(field as string) && value === false) continue;

    if (field === 'specs') {
      const canonical = canonicalizeSpecs(String(value));
      // A param that parses to nothing filters nothing — it must map to the
      // SAME key as an absent one, not to `specs=`.
      if (canonical === '') continue;
      segments.push(`specs=${encodeSegment(canonical)}`);
      continue;
    }

    segments.push(`${String(field)}=${encodeSegment(String(value))}`);
  }

  return segments.join('|');
}

/**
 * Prefix of the public facet-count cache (`GET /categories/:id/filterable-specs`,
 * TASK-708).
 *
 * Deliberately NESTED under {@link PRODUCT_LIST_PREFIX}: facet counts are a
 * function of exactly the rows the listing reads — stock, prices, spec values,
 * visibility, compatibility — so every write that already purges the listing
 * (`ProductService`, `CategoryService`, order/return stock moves, image writes)
 * must purge the counts as well, and a nested prefix makes that true for all of
 * them without touching one. The one extra writer is the admin spec-template
 * CRUD (`AttributeDefinitionService`), which purges this prefix itself.
 *
 * It cannot collide with a listing entry: every listing key opens with
 * `v2:page=` (the version, then the page, which is always serialized), this one
 * with `facets:`.
 */
export const FILTERABLE_SPECS_PREFIX = `${PRODUCT_LIST_PREFIX}:facets`;

/**
 * Everything that changes a facet-count response. Mirrors
 * `FilterableSpecsQueryDto` plus the path category, with the taxonomy axes
 * keyed by canonical SLUG exactly as in {@link ProductListKeyParams} (TASK-420).
 */
export interface FilterableSpecsKeyParams {
  /**
   * The path category. Keyed by its id because the route takes nothing else —
   * there is one spelling per category, so the id IS the canonical form.
   */
  categoryId: string;
  /** Canonical brand SLUG (or `!unknown`). */
  brand?: string;
  /** Canonical device-model SLUG (or `!unknown`). */
  device?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  /** The APPLIED facets, re-serialized from `parseSpecFilters`. */
  specs?: string;
  onSale?: boolean;
  inStock?: boolean;
}

const FILTERABLE_SPECS_KEY_FIELDS: ReadonlyArray<keyof FilterableSpecsKeyParams> = [
  'categoryId',
  'brand',
  'device',
  'minPrice',
  'maxPrice',
  'search',
  'specs',
  'onSale',
  'inStock',
];

/**
 * Deterministic cache key for one facet-count response (TASK-708). The same
 * normalization as the listing key — see {@link serializeSegments}.
 */
export function buildFilterableSpecsKey(params: FilterableSpecsKeyParams): string {
  return `${FILTERABLE_SPECS_PREFIX}:${serializeSegments(params, FILTERABLE_SPECS_KEY_FIELDS)}`;
}
