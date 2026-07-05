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
  @IsUUID(4, { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  @ApiProperty({
    description: 'Filter by brand (manufacturer) ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID(4, { message: 'Brand ID must be a valid UUID' })
  brandId?: string;

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
    description: 'Sort field (createdAt, price, name)',
    example: 'createdAt',
    required: false,
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'price', 'name'], {
    message: 'sortBy must be one of: createdAt, price, name',
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
