import {
  IsOptional,
  IsInt,
  IsBoolean,
  IsUUID,
  Min,
  Max,
  IsString,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for querying the category list (public and admin endpoints).
 *
 * Supports pagination, filtering by active status and parent category,
 * and text search across category name.
 * By default, only active categories are shown to the public.
 */
export class CategoryListQueryDto {
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
      'Filter by active status — honoured only on the admin listing; the public list is always active-only (TASK-297)',
    example: true,
    required: false,
  })
  @IsOptional()
  // Read the ORIGINAL query value from `obj`, not the `value` argument: the
  // global ValidationPipe runs with `enableImplicitConversion: true`, which
  // coerces the raw string to Boolean BEFORE this transform — and
  // `Boolean('false')` is `true`, so `?isActive=false` used to filter to ACTIVE
  // categories. Same fix as ProductListQueryDto (TASK-230).
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;

  @ApiProperty({
    description: 'Filter by parent category ID. Use "root" to get only root categories (no parent)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('loose', { message: 'Parent ID must be a valid UUID' })
  parentId?: string;

  @ApiProperty({
    description: 'Search by category name',
    example: 'phone',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, {
    message: 'Search query must be at most 200 characters',
  })
  search?: string;

  @ApiProperty({
    description: 'Sort field (name, sortOrder, createdAt)',
    example: 'sortOrder',
    required: false,
    default: 'sortOrder',
  })
  @IsOptional()
  @IsString()
  @IsIn(['name', 'sortOrder', 'createdAt'], {
    message: 'sortBy must be one of: name, sortOrder, createdAt',
  })
  sortBy?: string = 'sortOrder';

  @ApiProperty({
    description: 'Sort order (asc or desc)',
    example: 'asc',
    required: false,
    default: 'asc',
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'], {
    message: 'sortOrder must be asc or desc',
  })
  sortOrder?: 'asc' | 'desc' = 'asc';
}
