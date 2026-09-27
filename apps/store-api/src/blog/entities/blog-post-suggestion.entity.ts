import { ApiProperty } from '@nestjs/swagger';
import type { BlogPost } from '@prisma/client';

/** The only columns a suggestion row is read with (TASK-543). */
export type BlogPostSuggestionRow = Pick<BlogPost, 'id' | 'slug' | 'title' | 'coverImageUrl'>;

/**
 * One blog article in the storefront search-autocomplete popup (TASK-543).
 *
 * Deliberately NOT {@link BlogPostEntity}: the popup shows a title, a slug to
 * link to and a thumbnail, and the full entity carries the sanitised article
 * body (`content`) — tens of kilobytes per post, five posts per keystroke. The
 * repository reads exactly these four columns, so the body never leaves
 * Postgres for a suggestion.
 */
export class BlogPostSuggestionEntity {
  @ApiProperty({ description: 'Post id', example: 'b3f7c2a0-1111-4c6b-9a1e-0f1f2e3d4c5b' })
  id!: string;

  @ApiProperty({
    description: 'URL slug — the article lives at /blog/{slug}',
    example: 'power-bank-guide',
  })
  slug!: string;

  @ApiProperty({ description: 'Post title', example: 'Як обрати павербанк' })
  title!: string;

  @ApiProperty({
    description: 'Cover image URL for the row thumbnail, or null',
    type: String,
    nullable: true,
    example: null,
  })
  coverImageUrl!: string | null;

  static fromRow(row: BlogPostSuggestionRow): BlogPostSuggestionEntity {
    const entity = new BlogPostSuggestionEntity();
    entity.id = row.id;
    entity.slug = row.slug;
    entity.title = row.title;
    entity.coverImageUrl = row.coverImageUrl ?? null;
    return entity;
  }
}
