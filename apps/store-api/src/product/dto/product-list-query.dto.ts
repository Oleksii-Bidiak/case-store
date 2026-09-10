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
    description: 'Filter by category ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('loose', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  @ApiProperty({
    description: 'Filter by brand (manufacturer) ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('loose', { message: 'Brand ID must be a valid UUID' })
  brandId?: string;

  @ApiProperty({
    description: 'Filter by compatible device model ID (TASK-190)',
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
      'Structured spec facet filter as a single "key:value" pair (TASK-191), e.g. "material:Силікон". ' +
      'Kept a plain string on the wire so it maps to a normal query param; parsed to a ' +
      '{ key, value } pair server-side via parseSpecFilter (malformed input is ignored).',
    example: 'material:Силікон',
    type: String,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'specs must be at most 200 characters' })
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

/**
 * Parse the `specs=key:value` facet param into a `{ key, value }` pair
 * (TASK-191). Splits on the FIRST colon only so a value may itself contain
 * colons; returns `undefined` for missing or malformed input (empty key/value,
 * no colon), so the caller simply applies no facet filter.
 */
export function parseSpecFilter(raw?: string): { key: string; value: string } | undefined {
  if (typeof raw !== 'string') return undefined;
  const idx = raw.indexOf(':');
  if (idx <= 0) return undefined;
  const key = raw.slice(0, idx).trim();
  const value = raw.slice(idx + 1).trim();
  if (key === '' || value === '') return undefined;
  return { key, value };
}
