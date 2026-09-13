import { IsOptional, IsInt, IsString, IsEnum, Matches, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PublishStatus } from '@prisma/client';

/**
 * Query DTO for the public blog list (published posts only). Supports filtering
 * by category slug, a free-text search over title + excerpt, and pagination.
 */
export class BlogPostListQueryDto {
  @ApiProperty({
    description: 'Filter by category slug',
    example: 'guides',
    required: false,
  })
  // Constrained to the charset `generateSlug` actually produces. Not cosmetic:
  // since TASK-417 this value is interpolated into a Meilisearch filter
  // expression, and a quote inside it rewrote the expression — silently
  // dropping the category the URL says is selected.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Category must be a slug (lowercase letters, digits and hyphens)',
  })
  category?: string;

  @ApiProperty({
    description: 'Free-text search over title and excerpt',
    example: 'навушники',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;

  @ApiProperty({ description: 'Page number (1-based)', example: 1, required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    example: 9,
    required: false,
    default: 9,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit must be at most 100' })
  limit?: number = 9;
}

/**
 * Query DTO for the admin blog list (all statuses), adding an optional publish
 * status filter on top of the public search/category/pagination.
 */
export class AdminBlogPostListQueryDto extends BlogPostListQueryDto {
  @ApiProperty({
    description: 'Filter by publish status (DRAFT, SCHEDULED, PUBLISHED)',
    enum: PublishStatus,
    example: PublishStatus.PUBLISHED,
    required: false,
  })
  @IsOptional()
  @IsEnum(PublishStatus, {
    message: `status must be one of: ${Object.values(PublishStatus).join(', ')}`,
  })
  status?: PublishStatus;
}
