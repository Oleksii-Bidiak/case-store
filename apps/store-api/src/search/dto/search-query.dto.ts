import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'Narrow to a category. Rolls up the whole subtree (a parent id also matches products ' +
      'filed in its subcategories), exactly like the catalogue listing.',
    example: 'c1a2b3c4-0000-4000-8000-000000000000',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Narrow to one manufacturer (brand id).' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  brandId?: string;

  @ApiPropertyOptional({ description: 'Narrow to products compatible with one device model.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
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
