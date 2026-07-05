import { ApiProperty } from '@nestjs/swagger';
import { PublishStatus } from '@prisma/client';

/**
 * Domain entity representing a static / service page.
 *
 * Clean domain entity (not a Prisma model) returned by PageService methods.
 * Contains only the data exposed to clients.
 */
export class PageEntity {
  @ApiProperty({
    description: 'Page unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'privacy-policy' })
  slug!: string;

  @ApiProperty({ description: 'Page title', example: 'Privacy Policy' })
  title!: string;

  @ApiProperty({
    description: 'Page body as sanitized HTML (Tiptap output)',
    example: '<h2>Section</h2><p>Content…</p>',
  })
  content!: string;

  @ApiProperty({
    description: 'Short summary used for listings and meta description fallback',
    example: 'How we handle your personal data.',
    type: String,
    nullable: true,
    required: false,
  })
  excerpt!: string | null;

  @ApiProperty({
    description: 'SEO meta title (falls back to title)',
    example: 'Privacy Policy — Mobile Store',
    type: String,
    nullable: true,
    required: false,
  })
  metaTitle!: string | null;

  @ApiProperty({
    description: 'SEO meta description',
    example: 'Read how Mobile Store collects and protects your data.',
    type: String,
    nullable: true,
    required: false,
  })
  metaDescription!: string | null;

  @ApiProperty({
    description: 'Publish lifecycle state — PUBLISHED is the public-visibility gate',
    enum: PublishStatus,
    example: PublishStatus.PUBLISHED,
  })
  status!: PublishStatus;

  @ApiProperty({
    description: 'When the page first went live (null while draft / scheduled)',
    example: '2026-01-01T00:00:00.000Z',
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

  @ApiProperty({
    description: 'Derived read-only mirror of (status === PUBLISHED); not a gate',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({ description: 'Display sort order (lower = first)', example: 0 })
  sortOrder!: number;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Create a PageEntity from a Prisma Page model.
   */
  static fromPrisma(page: {
    id: string;
    slug: string;
    title: string;
    content: string;
    excerpt: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    status: PublishStatus;
    publishedAt: Date | null;
    scheduledAt: Date | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }): PageEntity {
    const entity = new PageEntity();
    entity.id = page.id;
    entity.slug = page.slug;
    entity.title = page.title;
    entity.content = page.content;
    entity.excerpt = page.excerpt;
    entity.metaTitle = page.metaTitle;
    entity.metaDescription = page.metaDescription;
    entity.status = page.status;
    entity.publishedAt = page.publishedAt;
    entity.scheduledAt = page.scheduledAt;
    entity.isActive = page.isActive;
    entity.sortOrder = page.sortOrder;
    entity.createdAt = page.createdAt;
    entity.updatedAt = page.updatedAt;
    return entity;
  }
}
