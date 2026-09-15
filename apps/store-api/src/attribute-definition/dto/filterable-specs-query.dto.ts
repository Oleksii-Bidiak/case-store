import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
// Direct file import rather than the '../../catalog-filter' barrel: a DTO must
// not drag the resolver (and with it three repositories) into every module that
// only wanted to validate a query string.
import { SLUG_MAX_LENGTH, blankToUndefined } from '../../catalog-filter/slug-filter.dto-util';

/**
 * The ACTIVE catalogue filters, as sent alongside a facet request (TASK-489).
 *
 * Why the facets endpoint needs them at all: each value is published with the
 * number of products behind it, and that number has to account for everything
 * else the shopper has already narrowed by — «Силікон (12)» must lead to a page
 * of twelve, not of forty. The category is the path param; these are the rest.
 *
 * Deliberately the SAME param names, spellings and transforms as
 * `ProductListQueryDto`, because the storefront forwards the very params it
 * lists with: a facet param that meant something subtly different from its
 * listing twin is the drift this endpoint exists to prevent.
 *
 * Pagination and sorting are absent — they move rows between pages, never in or
 * out of the slice, so they cannot change a count.
 */
export class FilterableSpecsQueryDto {
  @ApiProperty({
    description: 'Active brand (manufacturer) SLUG — `?brand=apple` (TASK-420).',
    example: 'apple',
    required: false,
  })
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH, { message: 'brand must be at most 120 characters' })
  brand?: string;

  @ApiProperty({
    description: 'Active compatible device-model SLUG — `?device=iphone-15` (TASK-420).',
    example: 'iphone-15',
    required: false,
  })
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH, { message: 'device must be at most 120 characters' })
  device?: string;

  @ApiProperty({ description: 'Active minimum price filter', example: '10.00', required: false })
  @IsOptional()
  @Transform(({ value }: { value: string }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  })
  @IsNumber({}, { message: 'minPrice must be a number' })
  @Min(0, { message: 'minPrice must be at least 0' })
  minPrice?: number;

  @ApiProperty({ description: 'Active maximum price filter', example: '100.00', required: false })
  @IsOptional()
  @Transform(({ value }: { value: string }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  })
  @IsNumber({}, { message: 'maxPrice must be a number' })
  @Min(0, { message: 'maxPrice must be at least 0' })
  maxPrice?: number;

  @ApiProperty({ description: 'Active keyword search', example: 'чохол', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Search query must be at most 200 characters' })
  search?: string;

  @ApiProperty({
    description:
      'Active structured-spec selection — `key:v1,v2;key2:v3`, the same grammar as the ' +
      "listing's `specs`. Each facet is counted with its OWN selection removed, so " +
      'ticking a second value in a facet a shopper is already filtering by stays possible.',
    example: 'material:Силікон,TPU;case-type:Накладка',
    type: String,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(600, { message: 'specs must be at most 600 characters' })
  specs?: string;

  @ApiProperty({
    description: 'Active «В наявності» filter — `stock > 0` (TASK-414).',
    example: true,
    required: false,
  })
  @IsOptional()
  // Read the ORIGINAL query value from `obj`, not the coerced `value`: the
  // global ValidationPipe runs with `enableImplicitConversion: true`, which
  // Boolean-coerces the raw string BEFORE this transform — and
  // `Boolean('false')` is `true`, so `?inStock=false` would mean "in stock only".
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'inStock must be true or false' })
  inStock?: boolean;

  @ApiProperty({
    description: 'Active on-sale filter (compareAtPrice > price), TASK-179.',
    example: true,
    required: false,
  })
  @IsOptional()
  // Same `obj[key]` read as `inStock` above, for the same reason.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'onSale must be true or false' })
  onSale?: boolean;
}
