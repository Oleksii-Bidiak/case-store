import { IsOptional, IsInt, IsString, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Query DTO for the ADMIN blog-category list (TASK-357).
 *
 * The public `GET /api/blog/categories` keeps taking no query: the storefront's
 * blog hub renders the complete category strip, so paging it would amputate the
 * filter bar. Only the admin route gets this DTO, which is what keeps that
 * promise mechanically — `forbidNonWhitelisted` turns a stray `?page=2` on the
 * public route into a 400 instead of a silent behaviour change.
 *
 * `page` and `limit` carry NO field initializer on purpose: their ABSENCE means
 * "return everything". The admin category list is drag-and-drop reorderable and
 * its reorder payload must name EVERY category or the server rejects it as a
 * lost update (409, see `common/reorder`) — so "everything" has to stay the
 * default the panel gets.
 */
export class AdminBlogCategoryListQueryDto {
  @ApiProperty({
    description: 'Page number (1-based). Omit both page and limit to get the complete list.',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number;

  @ApiProperty({
    description: 'Items per page. Omit both page and limit to get the complete list.',
    example: 20,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit?: number;

  @ApiProperty({ description: 'Search by category name', example: 'гайд', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Search query must be at most 200 characters' })
  search?: string;
}
