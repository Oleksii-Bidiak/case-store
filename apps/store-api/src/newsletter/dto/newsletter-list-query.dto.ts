import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { NewsletterStatus } from '@prisma/client';

/**
 * Sortable columns of the subscriber list (TASK-356) — exactly the three the
 * admin table gives a header to. `source` is left out on purpose: it is null for
 * most rows, so sorting by it produces one meaningful block and a long tail of
 * blanks.
 *
 * Exported so the repository allow-list is derived from this same tuple. A
 * `sortBy` the DTO accepts and the repository quietly ignores is worse than no
 * sorting at all — the header renders as sorted over rows that never moved, and
 * nothing anywhere reports a problem.
 */
export const NEWSLETTER_SORT_FIELDS = ['createdAt', 'email', 'status'] as const;

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

  @ApiProperty({
    description: `Sort field (${NEWSLETTER_SORT_FIELDS.join(', ')})`,
    example: 'createdAt',
    required: false,
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(NEWSLETTER_SORT_FIELDS, {
    message: `sortBy must be one of: ${NEWSLETTER_SORT_FIELDS.join(', ')}`,
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

/**
 * Query DTO for the admin CSV export — same filters as the list, minus
 * pagination (the export streams every matching row). Deliberately without
 * sortBy: the export is opened in a spreadsheet, which sorts better than we can.
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
