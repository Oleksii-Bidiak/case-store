import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MEDIA_USAGE_MAX_URLS } from '../media-usage.repository';

/** Page size used when the caller names none. A grid of thumbnails, not a table. */
export const DEFAULT_MEDIA_PAGE_SIZE = 24;

/**
 * Query DTO for the admin media list (TASK-441).
 *
 * Pagination is ALWAYS on here, unlike the banner list which returns everything
 * when asked for no page. A banner list is a dozen rows that a drag-and-drop
 * reorder has to name in full; a media library only grows, and the endpoint
 * computes usage for every row it returns — an unpaginated read would ask
 * {@link MediaUsageRepository} about the whole table in one request.
 */
export class MediaListQueryDto {
  @ApiProperty({
    description:
      'Free-text search. Matches alt text (case-insensitive substring) OR an exact tag — ' +
      'an operator looking for "банер" does not remember which field they typed it into.',
    example: 'iphone',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Search query must be at most 200 characters' })
  search?: string;

  @ApiProperty({
    description: 'Narrow to assets carrying this exact tag. Combined with `search` as AND.',
    example: 'банер',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Tag must be at most 50 characters' })
  tag?: string;

  @ApiProperty({ description: 'Page number (1-based)', example: 1, required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number;

  @ApiProperty({
    description: 'Items per page',
    example: DEFAULT_MEDIA_PAGE_SIZE,
    required: false,
    default: DEFAULT_MEDIA_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  // Pinned to the usage-scan cap, not chosen independently: this page's URLs are
  // what `MediaUsageRepository.findUsage` is handed, and that call refuses to be
  // asked about more than it can scan safely. Two numbers that must agree, so
  // they are one number.
  @Max(MEDIA_USAGE_MAX_URLS, { message: `Limit must be at most ${MEDIA_USAGE_MAX_URLS}` })
  limit?: number;
}
