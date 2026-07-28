import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsIn,
  IsString,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

/**
 * DTO for querying the user list (admin-only endpoint).
 *
 * Supports pagination, filtering by role and active status,
 * and text search across email, firstName, and lastName.
 */
export class UserListQueryDto {
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

  // `enum: UserRole`, not a literal list, and the validator message is derived
  // rather than spelled out. The hand-written pair went stale the moment TASK-334
  // added MANAGER: the generated client refused the value, so the owner could not
  // filter the user list down to the very role they had just created — while the
  // runtime @IsEnum was happily accepting it. A copy of an enum that already knows
  // its own members can only drift.
  @ApiProperty({
    description: 'Filter by user role',
    example: 'CUSTOMER',
    required: false,
    enum: UserRole,
  })
  @IsOptional()
  @IsEnum(UserRole, {
    message: `Role must be one of: ${Object.values(UserRole).join(', ')}`,
  })
  role?: UserRole;

  @ApiProperty({
    description: 'Filter by active status',
    example: true,
    required: false,
  })
  @IsOptional()
  // Read the ORIGINAL query value from `obj`, not the `value` argument. The
  // global ValidationPipe runs with `enableImplicitConversion: true`, which
  // coerces the raw string to the reflected `Boolean` type BEFORE this transform
  // — and `Boolean('false')` is `true`. Deriving from `obj[key]` (the untouched
  // `'true'`/`'false'` string) is the only way to distinguish the two; anything
  // unrecognised falls through to `undefined` (no filter). (TASK-150 B5)
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;

  @ApiProperty({
    description: 'Search by email, first name, or last name',
    example: 'john',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Search query must be at most 200 characters' })
  search?: string;

  @ApiProperty({
    description: 'Sort field (createdAt, email)',
    example: 'createdAt',
    required: false,
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'email'], {
    message: 'sortBy must be one of: createdAt, email',
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
  @IsIn(['asc', 'desc'], { message: 'sortOrder must be asc or desc' })
  sortOrder?: 'asc' | 'desc' = 'desc';
}
