import {
  IsOptional,
  IsBoolean,
  IsInt,
  IsString,
  IsEnum,
  Matches,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PublishStatus } from '@prisma/client';

/**
 * Category / free-text / pagination filters shared by the public and the admin
 * post list.
 *
 * Split out of `BlogPostListQueryDto` by TASK-436 so that `includeUnlisted`
 * lives on the PUBLIC query only: the admin panel shows every post whatever its
 * `listed` flag, so inheriting the parameter would have documented a knob that
 * does nothing — and invited someone to wire it up.
 */
export class BlogPostSearchQueryDto {
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
 * Query DTO for the public blog list (published posts only). Supports filtering
 * by category slug, a free-text search over title + excerpt, pagination, and the
 * `listed` visibility opt-in below.
 */
export class BlogPostListQueryDto extends BlogPostSearchQueryDto {
  @ApiProperty({
    description:
      'Include posts flagged `listed = false` (TASK-436). Omitted / false — the default — ' +
      'returns only listed posts, which is what every LIST surface wants (the /blog grid, ' +
      'the header search suggestions, related posts). `sitemap.xml` is the one caller that ' +
      'passes true: an unlisted post is still a public, indexable document, so leaving it ' +
      'out of the sitemap while it stays reachable is the cloaking-shaped design this flag ' +
      'replaced. Deliberately a PUBLIC parameter — nothing here is a secret; an unlisted ' +
      'post is simply not advertised in feeds.',
    example: false,
    required: false,
    default: false,
  })
  @IsOptional()
  // Read the ORIGINAL query value from `obj`, not the `value` argument: the global
  // ValidationPipe runs with `enableImplicitConversion: true`, which coerces the raw
  // string to Boolean BEFORE this transform — and `Boolean('false')` is `true`, so
  // `?includeUnlisted=false` would otherwise mean "include them". Same fix as
  // CategoryListQueryDto / ProductListQueryDto (TASK-230).
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'includeUnlisted must be true or false' })
  includeUnlisted?: boolean;
}

/**
 * Query DTO for the admin blog list (all statuses), adding an optional publish
 * status filter on top of the shared search/category/pagination. No
 * `includeUnlisted`: the panel is where the `listed` flag is SET, so it always
 * shows both kinds.
 */
export class AdminBlogPostListQueryDto extends BlogPostSearchQueryDto {
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
