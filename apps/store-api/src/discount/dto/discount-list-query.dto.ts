import { IsOptional, IsInt, IsBoolean, IsString, MaxLength, IsIn, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for querying the admin discount list. Supports pagination, an active
 * filter, and a case-insensitive code search.
 */
export class DiscountListQueryDto {
  @ApiProperty({ description: 'Page number (1-based)', example: 1, required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiProperty({ description: 'Items per page', example: 20, required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit?: number = 20;

  @ApiProperty({ description: 'Filter by active status', example: true, required: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;

  @ApiProperty({
    description: 'Search by code (case-insensitive)',
    example: 'SUMMER',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'Search query must be at most 64 characters' })
  search?: string;

  @ApiProperty({
    description: 'Sort field (code, createdAt, redeemedCount, expiresAt)',
    example: 'createdAt',
    required: false,
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['code', 'createdAt', 'redeemedCount', 'expiresAt'], {
    message: 'sortBy must be one of: code, createdAt, redeemedCount, expiresAt',
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
