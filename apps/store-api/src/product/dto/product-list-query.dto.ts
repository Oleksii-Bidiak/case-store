import {
  IsOptional,
  IsInt,
  IsNumber,
  Min,
  Max,
  IsString,
  IsBoolean,
  IsUUID,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
// Direct file import rather than the '../../catalog-filter' barrel: a DTO must
// not drag the resolver (and with it three repositories) into every module that
// only wanted to validate a query string.
import { SLUG_MAX_LENGTH, blankToUndefined } from '../../catalog-filter/slug-filter.dto-util';

/**
 * DTO for querying the product list (public endpoint).
 *
 * Supports pagination, filtering by category, active status,
 * price range, and text search across name and description.
 * By default, only active products are shown to the public.
 */
export class ProductListQueryDto {
  @ApiProperty({
    description: 'Page number (1-based)',
    example: 1,
    required: false,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
    required: false,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit?: number = 20;

  @ApiProperty({
    description:
      'Filter by category SLUG — the canonical storefront form since TASK-420 ' +
      '(`?category=phone-cases` rather than a uuid). Resolved to an id in the ' +
      'service; a slug that names nothing applies the filter and matches nothing ' +
      '(an empty 200 page), it is never a 400 and never silently widens the list. ' +
      'Wins over the legacy `categoryId` if both are sent.',
    example: 'phone-cases',
    required: false,
  })
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH, { message: 'category must be at most 120 characters' })
  category?: string;

  @ApiProperty({
    description:
      'Filter by brand (manufacturer) SLUG — `?brand=apple` (TASK-420). Same ' +
      'unknown-value behaviour as `category`. Wins over the legacy `brandId`.',
    example: 'apple',
    required: false,
  })
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH, { message: 'brand must be at most 120 characters' })
  brand?: string;

  @ApiProperty({
    description:
      'Filter by compatible device-model SLUG — `?device=iphone-15` (TASK-420). ' +
      'Same unknown-value behaviour as `category`. Wins over the legacy ' +
      '`deviceModelId`.',
    example: 'iphone-15',
    required: false,
  })
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH, { message: 'device must be at most 120 characters' })
  device?: string;

  @ApiProperty({
    description:
      'Filter by category ID. LEGACY since TASK-420 — the storefront sends ' +
      '`?category=<slug>` and 308-redirects these away. Still valid input: the ' +
      'admin panel binds this same DTO and addresses categories by id.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('loose', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  @ApiProperty({
    description: 'Filter by brand (manufacturer) ID. LEGACY since TASK-420 — see `categoryId`.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('loose', { message: 'Brand ID must be a valid UUID' })
  brandId?: string;

  @ApiProperty({
    description:
      'Filter by compatible device model ID (TASK-190). LEGACY since TASK-420 — ' +
      'see `categoryId`.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('loose', { message: 'Device model ID must be a valid UUID' })
  deviceModelId?: string;

  @ApiProperty({
    description:
      'Filter by active status — honoured only on the admin listing; the public list is always active-only (TASK-230)',
    example: true,
    required: false,
  })
  @IsOptional()
  // Read the ORIGINAL query value from `obj`, not the `value` argument: the
  // global ValidationPipe runs with `enableImplicitConversion: true`, which
  // coerces the raw string to Boolean BEFORE this transform — and
  // `Boolean('false')` is `true`, so `?isActive=false` used to filter to
  // ACTIVE products. Same fix as UserListQueryDto (TASK-150 B5 / TASK-230).
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;

  @ApiProperty({
    description:
      'Show the SOFT-DELETED (tombstoned) products instead of the live ones (TASK-427). ' +
      'Honoured ONLY on the admin listing — `ProductService.adminFindAll` is the single ' +
      'place that forwards it; every public read stays live-only whatever the caller sends. ' +
      'Absent or false = live products only (the default), true = tombstones only.',
    example: true,
    required: false,
  })
  @IsOptional()
  // Same `obj[key]` read as `isActive` above, for the same reason: the global
  // ValidationPipe's `enableImplicitConversion` turns 'false' into `true` before
  // this transform ever sees it — and `?deleted=false` silently listing ONLY the
  // tombstones is exactly the class of bug TASK-150 B5 found.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'deleted must be true or false' })
  deleted?: boolean;

  @ApiProperty({
    description:
      'Filter to positions with zero free-to-sell stock (TASK-362). Admin-only in ' +
      'practice: the restock worklist. Composes with every other filter.',
    example: true,
    required: false,
  })
  @IsOptional()
  // Same `obj[key]` read as `isActive` above, for the same reason: the global
  // ValidationPipe's `enableImplicitConversion` turns 'false' into `true` before
  // this transform ever sees it.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'outOfStock must be true or false' })
  outOfStock?: boolean;

  @ApiProperty({
    description:
      'Filter to products a shopper can actually buy right now — `stock > 0` (TASK-414). ' +
      'The storefront «В наявності» checkbox. Composes with every other filter. On the ' +
      'admin listing the opposite `outOfStock` worklist filter wins if both are sent.',
    example: true,
    required: false,
  })
  @IsOptional()
  // Same `obj[key]` read as `isActive` / `outOfStock` / `onSale`, for the same
  // reason spelled out below: under the global ValidationPipe's
  // `enableImplicitConversion: true` the raw query string is Boolean-coerced
  // BEFORE this transform runs, and `Boolean('false')` is `true` — so a naive
  // `@Type(() => Boolean)` would make `?inStock=false` mean "in stock only".
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'inStock must be true or false' })
  inStock?: boolean;

  @ApiProperty({
    description:
      'Filter to products currently on sale (compareAtPrice set and greater than price). ' +
      'Composes with every other filter and with sortBy=bestselling (TASK-179).',
    example: true,
    required: false,
  })
  @IsOptional()
  // Read the ORIGINAL query value from `obj`, not the coerced `value`: under
  // the global ValidationPipe's `enableImplicitConversion: true`, the raw
  // string is Boolean-coerced BEFORE this transform runs — and
  // `Boolean('false')` is `true`, so `?onSale=false` would wrongly filter to
  // on-sale. Same fix as the `isActive` transform above (TASK-179).
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'onSale must be true or false' })
  onSale?: boolean;

  @ApiProperty({
    description: 'Minimum price filter',
    example: '10.00',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: string }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  })
  @IsNumber({}, { message: 'minPrice must be a number' })
  @Min(0, { message: 'minPrice must be at least 0' })
  minPrice?: number;

  @ApiProperty({
    description: 'Maximum price filter',
    example: '100.00',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: string }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  })
  @IsNumber({}, { message: 'maxPrice must be a number' })
  @Min(0, { message: 'maxPrice must be at least 0' })
  maxPrice?: number;

  @ApiProperty({
    description: 'Search by product name or description',
    example: 'iphone case',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Search query must be at most 200 characters' })
  search?: string;

  @ApiProperty({
    description:
      'Structured spec facet filter (TASK-191, multi-value since TASK-414 / owner decision B-10): ' +
      '`key:v1,v2;key2:v3`. Values INSIDE one facet are OR-ed, facets are AND-ed — ' +
      '"силікон or TPU, and a case". The original single-pair form ("material:Силікон") ' +
      'stays a valid input so live links keep working. Kept a plain string on the wire so ' +
      'it maps to a normal query param; parsed server-side via parseSpecFilters (malformed ' +
      'chunks are ignored, never rejected). Values may contain ":" but NOT "," or ";" — ' +
      'those are the separators and there is no escape form.',
    example: 'material:Силікон,TPU;case-type:Накладка',
    type: String,
    required: false,
  })
  @IsOptional()
  @IsString()
  // Raised from 200 for the multi-value form (TASK-414): the parser caps the
  // result at MAX_SPEC_FACETS × MAX_SPEC_VALUES_PER_FACET, and 600 characters
  // comfortably holds that many realistic Ukrainian facet values while still
  // bounding what reaches the parser.
  @MaxLength(600, { message: 'specs must be at most 600 characters' })
  specs?: string;

  @ApiProperty({
    description:
      'Sort field: createdAt, price, name, stock, or bestselling. `bestselling` orders by ' +
      'units sold across PAID orders (TASK-164); zero-sales products still appear, ' +
      'newest-first, at the tail. `stock` sorts by available (free-to-sell) stock — the ' +
      'admin list "Вільно" sort (TASK-254); harmless on the public list, which never ' +
      'exposes raw stock.',
    example: 'createdAt',
    required: false,
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'price', 'name', 'stock', 'bestselling'], {
    message: 'sortBy must be one of: createdAt, price, name, stock, bestselling',
  })
  sortBy?: string = 'createdAt';

  @ApiProperty({
    description: 'Sort order (asc or desc)',
    example: 'desc',
    required: false,
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'], {
    message: 'sortOrder must be asc or desc',
  })
  sortOrder?: 'asc' | 'desc' = 'desc';
}

/** One requested spec facet: a definition key plus the values OR-ed within it. */
export interface SpecFacetFilter {
  key: string;
  values: string[];
}

/**
 * Hard ceiling on how many distinct facets one request may filter by. Each
 * facet becomes its OWN `where.AND` entry — a nested `specValues.some(...)`
 * subquery — so the count is a direct multiplier on query cost.
 */
export const MAX_SPEC_FACETS = 6;

/** Hard ceiling on the OR-ed values inside one facet (one `IN (...)` list). */
export const MAX_SPEC_VALUES_PER_FACET = 20;

/**
 * Parse the `specs` facet param into the requested facets (TASK-191, extended
 * to multi-value by TASK-414 / owner decision B-10).
 *
 * Grammar: `key:v1,v2;key2:v3` — `;` separates facets, the FIRST `:` in a chunk
 * separates the key from its values, `,` separates the values. Splitting the key
 * on the first colon only means a VALUE may still contain colons ("ratio:16:9");
 * a value may NOT contain `,` or `;`, which are the separators and have no escape
 * form (see the BACKLOG follow-up row).
 *
 * Semantics (B-10): values inside one facet are OR-ed, facets are AND-ed. This
 * function only reports what was asked for — the AND/OR is built in
 * `ProductRepository.findAll`.
 *
 * Robust by design: a malformed chunk (no colon, empty key, no non-empty values)
 * is SKIPPED rather than rejected, so an old or hand-edited link degrades to a
 * narrower filter instead of a 400. The legacy single-pair form
 * ("material:Силікон") therefore parses to exactly one facet with one value.
 *
 * Excess is discarded, not rejected: at most {@link MAX_SPEC_FACETS} facets and
 * {@link MAX_SPEC_VALUES_PER_FACET} values per facet survive. Repeating a key
 * MERGES its values into the one facet — two AND-ed conditions on the same
 * definition could never both match (`@@unique([productId, definitionId])`), so
 * merging is the only reading that is not silently empty.
 */
export function parseSpecFilters(raw?: string): SpecFacetFilter[] {
  if (typeof raw !== 'string') return [];

  const byKey = new Map<string, string[]>();

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

    const existing = byKey.get(key);
    if (existing) {
      existing.push(...values);
      continue;
    }
    // The facet ceiling applies to NEW keys only — a repeat of an already
    // accepted key merges above and costs no extra subquery.
    if (byKey.size >= MAX_SPEC_FACETS) continue;
    byKey.set(key, [...values]);
  }

  return [...byKey.entries()].map(([key, values]) => ({
    key,
    values: [...new Set(values)].slice(0, MAX_SPEC_VALUES_PER_FACET),
  }));
}

/**
 * Serialize parsed facets back to the wire form. Used for the CACHE KEY, where
 * it matters that the string reflects what was actually applied (post-cap,
 * post-dedup) rather than whatever the client typed. Ordering is NOT normalized
 * here — `buildProductListKey` canonicalizes it, so the sort lives in exactly
 * one place. Returns `undefined` when nothing is filtered, matching the
 * "omit absent fields" rule of the key builder.
 */
export function serializeSpecFilters(facets: SpecFacetFilter[]): string | undefined {
  if (facets.length === 0) return undefined;
  return facets.map((facet) => `${facet.key}:${facet.values.join(',')}`).join(';');
}
