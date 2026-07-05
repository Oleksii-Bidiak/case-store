import { ApiProperty } from '@nestjs/swagger';
import { PublishStatus } from '@prisma/client';
import { BlogCategoryEntity } from './blog-category.entity';

/**
 * Nested category summary embedded in a blog post entity — the storefront needs
 * the slug (for filter links) and the display name for badges.
 */
export class BlogPostCategorySummary {
  @ApiProperty({ description: 'Category id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'Category slug', example: 'guides' })
  slug!: string;

  @ApiProperty({ description: 'Category display name', example: 'Гайди' })
  name!: string;
}

/**
 * Domain entity for a blog post (TASK-170).
 *
 * Clean domain entity (not a Prisma model). It deliberately exposes ONLY
 * client-facing fields — the raw Prisma `categoryId` foreign key is folded into
 * the nested {@link BlogPostCategorySummary} instead of being leaked. Public
 * reads only ever return PUBLISHED rows (status = PUBLISHED, scheduledAt = null);
 * the admin surface reuses the same shape to see drafts / scheduled posts.
 */
export class BlogPostEntity {
  @ApiProperty({
    description: 'Post unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'iphone16-vs-15' })
  slug!: string;

  @ApiProperty({ description: 'Post title', example: 'iPhone 16 проти iPhone 15' })
  title!: string;

  @ApiProperty({
    description: 'Short summary used for cards and meta description',
    example: 'Розібрали камери, продуктивність та автономність.',
  })
  excerpt!: string;

  @ApiProperty({
    description: 'Post body as sanitized HTML (Tiptap output)',
    example: '<h2>Дизайн</h2><p>Текст…</p>',
  })
  content!: string;

  @ApiProperty({
    description: 'Cover image URL',
    example: 'https://cdn.example.com/blog/iphone16.jpg',
    type: String,
    nullable: true,
    required: false,
  })
  coverImageUrl!: string | null;

  @ApiProperty({
    description: 'Tiny blurred placeholder data URI for the cover (LQIP)',
    example: 'data:image/png;base64,iVBORw0KG…',
    type: String,
    nullable: true,
    required: false,
  })
  coverBlurDataUrl!: string | null;

  @ApiProperty({ description: 'Author display name', example: 'Олег Пилипенко' })
  authorName!: string;

  @ApiProperty({
    description: 'Estimated reading time in minutes',
    example: 8,
    type: Number,
    nullable: true,
    required: false,
  })
  readingMinutes!: number | null;

  @ApiProperty({ description: 'Whether the post is the featured hero post', example: false })
  featured!: boolean;

  @ApiProperty({ description: 'Category summary', type: BlogPostCategorySummary })
  category!: BlogPostCategorySummary;

  @ApiProperty({
    description: 'Publish lifecycle state — PUBLISHED is the public-visibility gate',
    enum: PublishStatus,
    example: PublishStatus.PUBLISHED,
  })
  status!: PublishStatus;

  @ApiProperty({
    description: 'When the post first went live (null while draft / scheduled)',
    example: '2026-06-28T00:00:00.000Z',
    type: String,
    format: 'date-time',
    nullable: true,
    required: false,
  })
  publishedAt!: Date | null;

  @ApiProperty({
    description: 'Future auto-publish instant while SCHEDULED (null otherwise)',
    example: '2026-08-01T09:00:00.000Z',
    type: String,
    format: 'date-time',
    nullable: true,
    required: false,
  })
  scheduledAt!: Date | null;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Create a BlogPostEntity from a Prisma BlogPost model with its category
   * relation included.
   */
  static fromPrisma(post: {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    coverImageUrl: string | null;
    coverBlurDataUrl: string | null;
    authorName: string;
    readingMinutes: number | null;
    featured: boolean;
    status: PublishStatus;
    publishedAt: Date | null;
    scheduledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    category: { id: string; slug: string; name: string };
  }): BlogPostEntity {
    const entity = new BlogPostEntity();
    entity.id = post.id;
    entity.slug = post.slug;
    entity.title = post.title;
    entity.excerpt = post.excerpt;
    entity.content = post.content;
    entity.coverImageUrl = post.coverImageUrl;
    entity.coverBlurDataUrl = post.coverBlurDataUrl;
    entity.authorName = post.authorName;
    entity.readingMinutes = post.readingMinutes;
    entity.featured = post.featured;
    entity.category = {
      id: post.category.id,
      slug: post.category.slug,
      name: post.category.name,
    };
    entity.status = post.status;
    entity.publishedAt = post.publishedAt;
    entity.scheduledAt = post.scheduledAt;
    entity.createdAt = post.createdAt;
    entity.updatedAt = post.updatedAt;
    return entity;
  }
}

export { BlogCategoryEntity };
