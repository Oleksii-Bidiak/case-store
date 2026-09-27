import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** Default number of articles in the header popup (TASK-218). */
export const BLOG_SUGGEST_DEFAULT_LIMIT = 5;
/** Hard cap — a suggestion list, not a page of results. */
export const BLOG_SUGGEST_MAX_LIMIT = 10;

/**
 * Query for `GET /api/blog/suggest` (TASK-543) — the storefront search
 * autocomplete's article rows. Same `q` bounds as the product suggest
 * (`SuggestQueryDto`), plus a small `limit`.
 */
export class BlogSuggestQueryDto {
  @ApiProperty({ description: 'Partial query string (min 1 char)', example: 'павербанк' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q!: string;

  @ApiProperty({
    description: 'Maximum number of suggestions',
    example: BLOG_SUGGEST_DEFAULT_LIMIT,
    required: false,
    default: BLOG_SUGGEST_DEFAULT_LIMIT,
    minimum: 1,
    maximum: BLOG_SUGGEST_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(BLOG_SUGGEST_MAX_LIMIT, { message: `Limit must be at most ${BLOG_SUGGEST_MAX_LIMIT}` })
  limit?: number = BLOG_SUGGEST_DEFAULT_LIMIT;
}
