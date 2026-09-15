import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
// Direct file import rather than the '../../catalog-filter' barrel — see the
// same note on ProductListQueryDto.
import { SLUG_MAX_LENGTH, blankToUndefined } from '../../catalog-filter/slug-filter.dto-util';

/**
 * Sort orders offered on the results page (TASK-417). `relevance` is the default
 * and the reason this is its own enum rather than the catalogue's
 * `sortBy`/`sortOrder` pair: ranked full-text relevance is not a column, so it
 * cannot be expressed as one.
 */
export const SEARCH_SORTS = ['relevance', 'price_asc', 'price_desc', 'newest'] as const;

export type SearchSort = (typeof SEARCH_SORTS)[number];

/** Query DTO for `GET /api/search` — paginated full-text results. */
export class SearchQueryDto {
  @ApiPropertyOptional({
    description: 'Search query (name / description / category). Blank returns the latest products.',
    example: 'айфон',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  // ─── facets (TASK-417) ──────────────────────────────────────────────────────
  // The results page now carries the same filter panel as the catalogue, so the
  // search endpoint has to narrow on the same axes. Every one of them is applied
  // on BOTH paths — as a Meilisearch `filter` expression when the engine answers
  // and as the equivalent `findAll` argument on the Postgres fallback — or a
  // filtered search would silently widen the moment the engine went down.

  // Since TASK-420 the canonical spelling of all three axes is a SLUG, here as
  // well as on the catalogue: `/search` migrated in the same change so the two
  // filter panels speak one param language. The slug never reaches the
  // Meilisearch filter expression — `CatalogueFilterResolver` turns it into an
  // id read back out of the database (or the nil-uuid "matches nothing"
  // sentinel) before the expression is built, so the injection concern the
  // uuid validation below was written for is answered by the resolution step
  // rather than by a pattern.

  @ApiPropertyOptional({
    description:
      'Narrow to a category by SLUG (TASK-420). Rolls up the whole subtree (a parent also ' +
      'matches products filed in its subcategories), exactly like the catalogue listing. ' +
      'An unknown slug matches nothing rather than widening the results.',
    example: 'phone-cases',
  })
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH, { message: 'category must be at most 120 characters' })
  category?: string;

  @ApiPropertyOptional({
    description: 'Narrow to one manufacturer by SLUG (TASK-420).',
    example: 'apple',
  })
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH, { message: 'brand must be at most 120 characters' })
  brand?: string;

  @ApiPropertyOptional({
    description: 'Narrow to products compatible with one device model, by SLUG (TASK-420).',
    example: 'iphone-15',
  })
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH, { message: 'device must be at most 120 characters' })
  device?: string;

  @ApiPropertyOptional({
    description:
      'Narrow to a category by id. LEGACY since TASK-420 (`?category=<slug>` is the ' +
      'canonical form and the results page 308-redirects this away); still accepted so ' +
      'live links keep working.',
    example: 'c1a2b3c4-0000-4000-8000-000000000000',
  })
  // Still validated as a UUID, exactly like the catalogue DTO's twin field — not
  // as a free 64-char string: it is an id, and anything else could only ever be
  // a miss.
  @IsOptional()
  @IsUUID('loose', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Narrow to one manufacturer (brand id). LEGACY — see `categoryId`.',
  })
  @IsOptional()
  @IsUUID('loose', { message: 'Brand ID must be a valid UUID' })
  brandId?: string;

  @ApiPropertyOptional({
    description: 'Narrow to products compatible with one device model. LEGACY — see `categoryId`.',
  })
  @IsOptional()
  @IsUUID('loose', { message: 'Device model ID must be a valid UUID' })
  deviceModelId?: string;

  @ApiPropertyOptional({
    description: 'Keep only products a shopper can buy right now (`stock > 0`).',
    example: true,
  })
  @IsOptional()
  // Read the ORIGINAL query value off `obj`, never the coerced `value`: the
  // global ValidationPipe runs with `enableImplicitConversion`, so the raw string
  // is Boolean-coerced before this transform ever sees it and `Boolean('false')`
  // is `true` — the same trap documented on the product list DTO.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'inStock must be true or false' })
  inStock?: boolean;

  @ApiPropertyOptional({ description: 'Minimum price filter', example: '10.00' })
  @IsOptional()
  @Transform(({ value }: { value: string }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  })
  @IsNumber({}, { message: 'minPrice must be a number' })
  @Min(0, { message: 'minPrice must be at least 0' })
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price filter', example: '100.00' })
  @IsOptional()
  @Transform(({ value }: { value: string }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  })
  @IsNumber({}, { message: 'maxPrice must be a number' })
  @Min(0, { message: 'maxPrice must be at least 0' })
  maxPrice?: number;

  @ApiPropertyOptional({
    description:
      'Result order. `relevance` (default) keeps the engine ranking; the others sort by ' +
      'price or recency and apply on the Postgres fallback too.',
    enum: SEARCH_SORTS,
    example: 'relevance',
  })
  @IsOptional()
  @IsString()
  @IsIn(SEARCH_SORTS, { message: `sort must be one of: ${SEARCH_SORTS.join(', ')}` })
  sort?: SearchSort;
}
