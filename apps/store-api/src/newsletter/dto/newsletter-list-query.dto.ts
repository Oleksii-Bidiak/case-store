import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { NewsletterStatus } from '@prisma/client';

/**
 * Query DTO for the admin subscriber list — pagination + optional status filter
 * and email search.
 */
export class NewsletterListQueryDto {
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
    description: 'Filter by subscription status',
    enum: NewsletterStatus,
    example: NewsletterStatus.SUBSCRIBED,
    required: false,
  })
  @IsOptional()
  @IsEnum(NewsletterStatus, {
    message: `status must be one of: ${Object.values(NewsletterStatus).join(', ')}`,
  })
  status?: NewsletterStatus;

  @ApiProperty({
    description: 'Case-insensitive email search',
    example: 'john',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Search must be at most 255 characters' })
  search?: string;
}

/**
 * Query DTO for the admin CSV export — same filters as the list, minus
 * pagination (the export streams every matching row).
 */
export class NewsletterExportQueryDto {
  @ApiProperty({
    description: 'Filter by subscription status',
    enum: NewsletterStatus,
    example: NewsletterStatus.SUBSCRIBED,
    required: false,
  })
  @IsOptional()
  @IsEnum(NewsletterStatus, {
    message: `status must be one of: ${Object.values(NewsletterStatus).join(', ')}`,
  })
  status?: NewsletterStatus;

  @ApiProperty({
    description: 'Case-insensitive email search',
    example: 'john',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Search must be at most 255 characters' })
  search?: string;
}
