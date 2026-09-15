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
 * Query for `GET /api/admin/staff` (TASK-476).
 *
 * Same shape as `UserListQueryDto` on purpose — page / limit / role / isActive /
 * search / sortBy / sortOrder — so the admin table component built for one list
 * works on the other without a second set of URL parameters to learn. What
 * differs is the scope, and the scope is NOT a parameter: the repository always
 * restricts to ADMIN and MANAGER, so no caller can widen this list into the
 * customer table by flipping a value.
 *
 * `role` therefore narrows WITHIN staff. Asking for CUSTOMER here is well-formed
 * and returns nothing, which is the truth rather than an error about a scope the
 * caller was never in.
 */
export class StaffListQueryDto {
  @ApiProperty({ description: 'Page number (1-based)', example: 1, required: false, default: 1 })
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
    description: 'Narrow to one staff role (ADMIN or MANAGER)',
    required: false,
    enum: UserRole,
  })
  @IsOptional()
  @IsEnum(UserRole, { message: `Role must be one of: ${Object.values(UserRole).join(', ')}` })
  role?: UserRole;

  @ApiProperty({ description: 'Filter by active status', example: true, required: false })
  @IsOptional()
  // Read the ORIGINAL query value from `obj`, not the `value` argument: the global
  // ValidationPipe runs with `enableImplicitConversion: true`, which coerces the
  // raw string to Boolean BEFORE this transform — and `Boolean('false')` is true
  // (TASK-150 B5).
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
    example: 'olena',
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
  @IsIn(['createdAt', 'email'], { message: 'sortBy must be one of: createdAt, email' })
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
